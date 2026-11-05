"""arc_core.transformer — single canonical causal-LM implementation.

arc_tiny and arc_neuron_small both import from here.  Any bug fixed here is
fixed for the entire model family; there is no second copy to drift.

Architecture: GPT-2-style pre-norm byte-level causal transformer.
  - CausalSelfAttention with registered causal-mask buffer (no re-alloc per call)
  - Pre-LN (LayerNorm before attn and FFN)
  - Tied token-embedding / output-head weights (saves params, standard practice)
  - Temperature guarded against zero-division (max(t, 1e-6))
  - Weight init: 0.02 std for Linear/Embedding, ones/zeros for LayerNorm
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class TransformerConfig:
    """Fully-parameterised config shared by all ARC-Neuron model tiers."""

    vocab_size: int = 256
    block_size: int = 64
    n_layer: int = 2
    n_head: int = 4
    n_embd: int = 64
    dropout: float = 0.0

    @property
    def ffw_hidden(self) -> int:
        return self.n_embd * 4

    @property
    def param_count_approx(self) -> int:
        """Rough parameter count without weight tying correction."""
        attn = 4 * self.n_embd * self.n_embd          # qkv + proj
        ffn  = 2 * self.n_embd * self.ffw_hidden       # fc + proj
        ln   = 4 * self.n_embd                         # 2 × (weight + bias) per block
        per_layer = attn + ffn + ln
        embed = self.vocab_size * self.n_embd           # token emb (head weight-tied)
        pos   = self.block_size * self.n_embd           # pos emb
        final_ln = 2 * self.n_embd
        return self.n_layer * per_layer + embed + pos + final_ln


class _CausalSelfAttention(nn.Module):
    def __init__(self, config: TransformerConfig) -> None:
        super().__init__()
        if config.n_embd % config.n_head != 0:
            raise ValueError(
                f"n_embd={config.n_embd} must be divisible by n_head={config.n_head}"
            )
        self.n_head = config.n_head
        self.head_dim = config.n_embd // config.n_head
        self.qkv  = nn.Linear(config.n_embd, 3 * config.n_embd)
        self.proj = nn.Linear(config.n_embd, config.n_embd)
        self.drop = nn.Dropout(config.dropout) if config.dropout > 0 else nn.Identity()
        # Causal mask — registered buffer so it moves with .to(device) and is
        # never reallocated per forward call.
        self.register_buffer(
            "mask",
            torch.tril(torch.ones(config.block_size, config.block_size)).view(
                1, 1, config.block_size, config.block_size
            ),
            persistent=False,
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, t, c = x.shape
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        def split_heads(tensor: torch.Tensor) -> torch.Tensor:
            return tensor.view(b, t, self.n_head, self.head_dim).transpose(1, 2)
        q, k, v = split_heads(q), split_heads(k), split_heads(v)
        scale = self.head_dim ** -0.5
        att = (q @ k.transpose(-2, -1)) * scale
        att = att.masked_fill(self.mask[:, :, :t, :t] == 0, float("-inf"))
        att = self.drop(F.softmax(att, dim=-1))
        y = (att @ v).transpose(1, 2).contiguous().view(b, t, c)
        return self.proj(y)


class _MLP(nn.Module):
    def __init__(self, config: TransformerConfig) -> None:
        super().__init__()
        self.fc   = nn.Linear(config.n_embd, config.ffw_hidden)
        self.proj = nn.Linear(config.ffw_hidden, config.n_embd)
        self.drop = nn.Dropout(config.dropout) if config.dropout > 0 else nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.drop(self.proj(F.gelu(self.fc(x))))


class _Block(nn.Module):
    def __init__(self, config: TransformerConfig) -> None:
        super().__init__()
        self.ln1  = nn.LayerNorm(config.n_embd)
        self.attn = _CausalSelfAttention(config)
        self.ln2  = nn.LayerNorm(config.n_embd)
        self.mlp  = _MLP(config)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.ln1(x))
        x = x + self.mlp(self.ln2(x))
        return x


class CausalTransformerLM(nn.Module):
    """Byte-level autoregressive language model used across all ARC-Neuron tiers."""

    def __init__(self, config: TransformerConfig) -> None:
        super().__init__()
        self.config    = config
        self.token_emb = nn.Embedding(config.vocab_size, config.n_embd)
        self.pos_emb   = nn.Embedding(config.block_size, config.n_embd)
        self.drop      = nn.Dropout(config.dropout) if config.dropout > 0 else nn.Identity()
        self.blocks    = nn.ModuleList([_Block(config) for _ in range(config.n_layer)])
        self.ln_f      = nn.LayerNorm(config.n_embd)
        self.head      = nn.Linear(config.n_embd, config.vocab_size, bias=False)
        # Weight tying: output projection reuses token-embedding matrix.
        # This halves embedding params and often improves generalisation.
        self.head.weight = self.token_emb.weight
        self._init_weights()

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
            elif isinstance(module, nn.LayerNorm):
                nn.init.ones_(module.weight)
                nn.init.zeros_(module.bias)

    def forward(
        self,
        idx: torch.Tensor,
        targets: Optional[torch.Tensor] = None,
    ) -> tuple[torch.Tensor, Optional[torch.Tensor]]:
        b, t = idx.shape
        if t > self.config.block_size:
            raise ValueError(
                f"Sequence length {t} exceeds block_size={self.config.block_size}"
            )
        pos = torch.arange(t, device=idx.device)
        x = self.drop(self.token_emb(idx) + self.pos_emb(pos))
        for block in self.blocks:
            x = block(x)
        logits = self.head(self.ln_f(x))
        loss: Optional[torch.Tensor] = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)), targets.view(-1)
            )
        return logits, loss

    @torch.no_grad()
    def generate(
        self,
        idx: torch.Tensor,
        max_new_tokens: int,
        temperature: float = 1.0,
    ) -> torch.Tensor:
        """Autoregressive generation with top-1 sampling at the given temperature."""
        for _ in range(max_new_tokens):
            ctx = idx[:, -self.config.block_size:]
            logits, _ = self(ctx)
            logits = logits[:, -1, :] / max(temperature, 1e-6)
            probs = F.softmax(logits, dim=-1)
            next_tok = torch.multinomial(probs, num_samples=1)
            idx = torch.cat([idx, next_tok], dim=1)
        return idx

    def param_count(self) -> int:
        return sum(p.numel() for p in self.parameters())
