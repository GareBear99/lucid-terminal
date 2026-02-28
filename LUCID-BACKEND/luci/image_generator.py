"""
Image Generation Module
Handles local image generation with OS-aware model selection
- Flux.1-schnell: Modern systems (Big Sur+, Windows 10+, Linux)
- Stable Diffusion 1.5: Legacy systems (Catalina, Windows 7)
"""

import os
import sys
import platform
import subprocess
from typing import Optional, Tuple, Dict
from pathlib import Path

class ImageGenerator:
    """OS-aware local image generation system"""
    
    def __init__(self):
        self.luciferai_dir = Path.home() / ".luciferai"
        self.models_dir = self.luciferai_dir / "image_models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        
        # Detect OS and capabilities
        self.os_info = self._detect_os()
        self.is_legacy_system = self.os_info['is_legacy']
        
        # Available models
        self.modern_model = "flux.1-schnell"
        self.legacy_model = "stable-diffusion-1.5"
        
        # Check what's installed
        self.installed_models = self._detect_installed_models()
    
    def _detect_os(self) -> Dict:
        """Detect OS and determine if it's a legacy system"""
        system = platform.system()
        release = platform.release()
        
        is_legacy = False
        os_name = system
        
        if system == "Darwin":  # macOS
            version = platform.mac_ver()[0]
            major, minor = version.split('.')[:2]
            major, minor = int(major), int(minor)
            
            # Catalina is 10.15, Big Sur is 11.0
            if major == 10 and minor <= 15:
                is_legacy = True
                os_name = f"macOS {version} (Catalina or older)"
            else:
                os_name = f"macOS {version}"
        
        elif system == "Windows":
            version = platform.version()
            # Windows 7 is version 6.1
            if "6.1" in version or "6.0" in version:
                is_legacy = True
                os_name = "Windows 7 or older"
            else:
                os_name = f"Windows {platform.win32_ver()[0]}"
        
        elif system == "Linux":
            os_name = f"Linux {release}"
            # Modern Linux systems can handle modern models
            is_legacy = False
        
        return {
            'system': system,
            'release': release,
            'os_name': os_name,
            'is_legacy': is_legacy
        }
    
    def _detect_installed_models(self) -> Dict[str, bool]:
        """Check which image generation models are installed"""
        installed = {
            'flux': False,
            'stable-diffusion': False,
            'invokeai': False,
            'diffusionbee': False
        }
        
        # Check for Flux (via ComfyUI or standalone)
        flux_markers = [
            self.models_dir / "flux.1-schnell",
            Path.home() / "ComfyUI" / "models" / "unet" / "flux1-schnell.safetensors"
        ]
        installed['flux'] = any(marker.exists() for marker in flux_markers)
        
        # Check for Stable Diffusion 1.5
        sd_markers = [
            self.models_dir / "stable-diffusion-1.5",
            Path.home() / ".cache" / "huggingface" / "diffusers" / "models--runwayml--stable-diffusion-v1-5"
        ]
        installed['stable-diffusion'] = any(marker.exists() for marker in sd_markers)
        
        # Check for InvokeAI
        try:
            result = subprocess.run(['invokeai', '--version'], capture_output=True, timeout=2)
            installed['invokeai'] = result.returncode == 0
        except:
            pass
        
        # Check for DiffusionBee (macOS only)
        if self.os_info['system'] == "Darwin":
            diffusionbee_path = Path("/Applications/DiffusionBee.app")
            installed['diffusionbee'] = diffusionbee_path.exists()
        
        return installed
    
    def get_recommended_model(self) -> str:
        """Get recommended model based on OS"""
        if self.is_legacy_system:
            return self.legacy_model
        else:
            return self.modern_model
    
    def get_best_installed_model(self) -> Optional[str]:
        """Get the best installed model for this system"""
        if not self.is_legacy_system:
            # Prefer Flux on modern systems
            if self.installed_models['flux']:
                return 'flux'
            elif self.installed_models['diffusionbee']:
                return 'diffusionbee'
        
        # Fall back to Stable Diffusion or InvokeAI
        if self.installed_models['stable-diffusion']:
            return 'stable-diffusion'
        elif self.installed_models['invokeai']:
            return 'invokeai'
        
        return None
    
    def generate_image(self, prompt: str, output_path: Optional[str] = None) -> Tuple[bool, str]:
        """
        Generate an image from text prompt
        Returns (success, path_or_error)
        """
        best_model = self.get_best_installed_model()
        
        if not best_model:
            return False, "No image generation models installed"
        
        if output_path is None:
            output_path = str(self.luciferai_dir / "generated_images" / "image.png")
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Generate based on available model
        if best_model == 'flux':
            return self._generate_flux(prompt, output_path)
        elif best_model == 'stable-diffusion':
            return self._generate_stable_diffusion(prompt, output_path)
        elif best_model == 'invokeai':
            return self._generate_invokeai(prompt, output_path)
        elif best_model == 'diffusionbee':
            return self._generate_diffusionbee(prompt, output_path)
        
        return False, "No suitable generation method found"
    
    def _generate_flux(self, prompt: str, output_path: str) -> Tuple[bool, str]:
        """Generate image using Flux"""
        try:
            # Use Python diffusers library
            script = f"""
import torch
from diffusers import FluxPipeline

pipe = FluxPipeline.from_pretrained("black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16)
pipe.to("mps" if torch.backends.mps.is_available() else "cpu")

image = pipe(
    "{prompt}",
    num_inference_steps=4,
    guidance_scale=0.0
).images[0]

image.save("{output_path}")
"""
            
            result = subprocess.run(
                [sys.executable, '-c', script],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0 and os.path.exists(output_path):
                return True, output_path
            else:
                return False, result.stderr or "Generation failed"
        except Exception as e:
            return False, str(e)
    
    def _generate_stable_diffusion(self, prompt: str, output_path: str) -> Tuple[bool, str]:
        """Generate image using Stable Diffusion 1.5"""
        try:
            script = f"""
import torch
from diffusers import StableDiffusionPipeline

pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5",
    torch_dtype=torch.float32
)
pipe.to("cpu")  # Legacy systems use CPU

image = pipe(
    "{prompt}",
    num_inference_steps=50
).images[0]

image.save("{output_path}")
"""
            
            result = subprocess.run(
                [sys.executable, '-c', script],
                capture_output=True,
                text=True,
                timeout=300  # Longer timeout for CPU generation
            )
            
            if result.returncode == 0 and os.path.exists(output_path):
                return True, output_path
            else:
                return False, result.stderr or "Generation failed"
        except Exception as e:
            return False, str(e)
    
    def _generate_invokeai(self, prompt: str, output_path: str) -> Tuple[bool, str]:
        """Generate using InvokeAI CLI"""
        try:
            cmd = ['invokeai-cli', '--prompt', prompt, '--output', output_path]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            if result.returncode == 0 and os.path.exists(output_path):
                return True, output_path
            else:
                return False, result.stderr or "InvokeAI generation failed"
        except Exception as e:
            return False, str(e)
    
    def _generate_diffusionbee(self, prompt: str, output_path: str) -> Tuple[bool, str]:
        """Open DiffusionBee with prompt (can't automate GUI)"""
        return False, "DiffusionBee is a GUI app - please open it manually and use prompt: " + prompt
    
    def get_installation_info(self) -> Dict:
        """Get information about what to install on this system"""
        info = {
            'os': self.os_info['os_name'],
            'is_legacy': self.is_legacy_system,
            'recommended_model': self.get_recommended_model(),
            'installed': self.installed_models,
            'install_commands': []
        }
        
        if self.is_legacy_system:
            # Legacy systems (Catalina, Windows 7)
            info['install_commands'] = [
                {
                    'name': 'Stable Diffusion 1.5 (via InvokeAI)',
                    'command': 'luci install stable-diffusion',
                    'description': 'CPU-based image generation (slower but compatible)',
                    'compatibility': 'macOS Catalina, Windows 7+'
                }
            ]
        else:
            # Modern systems
            info['install_commands'] = [
                {
                    'name': 'Flux.1-schnell (Recommended)',
                    'command': 'luci install flux',
                    'description': 'Fast, high-quality image generation (1-4 steps)',
                    'compatibility': 'macOS Big Sur+, Windows 10+, Linux'
                },
                {
                    'name': 'Stable Diffusion 1.5',
                    'command': 'luci install stable-diffusion',
                    'description': 'Standard image generation (50 steps)',
                    'compatibility': 'All systems'
                }
            ]
            
            # Add DiffusionBee for macOS
            if self.os_info['system'] == "Darwin":
                info['install_commands'].append({
                    'name': 'DiffusionBee (GUI)',
                    'command': 'luci install diffusionbee',
                    'description': 'Easy GUI interface for Stable Diffusion',
                    'compatibility': 'macOS Big Sur+ only'
                })
        
        return info
    
    def get_status_string(self) -> str:
        """Get formatted status string for display"""
        from lucifer_colors import Colors, Emojis, c
        
        lines = []
        lines.append(c(f"\n{Emojis.CAMERA} Image Generation Status\n", "cyan"))
        
        # OS info
        legacy_marker = " (Legacy)" if self.is_legacy_system else " (Modern)"
        lines.append(c(f"OS: ", "dim") + c(self.os_info['os_name'] + legacy_marker, "yellow"))
        
        # Installed models
        lines.append(c(f"\nInstalled Models:", "dim"))
        for model, installed in self.installed_models.items():
            status = c("✓", "green") if installed else c("✗", "red")
            lines.append(f"  {status} {model}")
        
        # Recommended
        lines.append(c(f"\nRecommended: ", "dim") + c(self.get_recommended_model(), "cyan"))
        
        # Best available
        best = self.get_best_installed_model()
        if best:
            lines.append(c(f"Active: ", "dim") + c(best, "green"))
        else:
            lines.append(c(f"Active: ", "dim") + c("None installed", "red"))
        
        return "\n".join(lines)
