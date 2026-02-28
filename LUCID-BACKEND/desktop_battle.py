#!/usr/local/opt/python@3.10/bin/python3.10
"""
🎮 Desktop Battle - Sprites fight ON your desktop!
No window borders, transparent background, sprites move across your actual desktop.
"""
import sys
import os
import pygame
from pygame.locals import *

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.physics_combat_engine import PhysicsCombatEngine, get_screen_resolution
from core.soul_system_v2 import Soul

class DesktopBattleRenderer:
    """Renders combat directly on desktop with transparent background."""
    
    def __init__(self, sprite1_path: str, sprite2_path: str, soul1: Soul, soul2: Soul):
        """Initialize pygame with transparent overlay."""
        pygame.init()
        
        # Get actual screen resolution
        self.screen_width, self.screen_height = get_screen_resolution()
        print(f"Desktop resolution: {self.screen_width}x{self.screen_height}")
        
        # Create borderless, transparent fullscreen window
        os.environ['SDL_VIDEO_WINDOW_POS'] = "0,0"
        
        # Create fullscreen window
        self.screen = pygame.display.set_mode(
            (self.screen_width, self.screen_height),
            pygame.NOFRAME | pygame.SRCALPHA
        )
        pygame.display.set_caption("Desktop Battle")
        
        # Set window to be click-through and stay on top (macOS specific)
        try:
            from AppKit import NSApp, NSWindow, NSFloatingWindowLevel
            import objc
            
            # Make window float above everything AND click-through
            for window in NSApp.sharedApplication().windows():
                window.setLevel_(NSFloatingWindowLevel)
                # Make window ignore mouse events (click-through)
                window.setIgnoresMouseEvents_(True)
                # Make window transparent to user interaction
                window.setOpaque_(False)
                window.setBackgroundColor_(None)
                print("✅ Window set to click-through mode - you can work normally!")
        except Exception as e:
            print(f"(Window layering not fully available: {e})")
            print("Window will still work but may capture mouse clicks")
        
        # Load sprites
        try:
            self.sprite1 = pygame.image.load(sprite1_path).convert_alpha()
            self.sprite2 = pygame.image.load(sprite2_path).convert_alpha()
            print(f"✅ Loaded sprites: {sprite1_path}, {sprite2_path}")
        except Exception as e:
            print(f"⚠️  Using placeholder sprites: {e}")
            # Create placeholder with transparency
            self.sprite1 = pygame.Surface((64, 64), pygame.SRCALPHA)
            pygame.draw.circle(self.sprite1, (100, 150, 255, 255), (32, 32), 28)
            pygame.draw.circle(self.sprite1, (255, 255, 0, 255), (32, 32), 12)
            
            self.sprite2 = pygame.Surface((64, 64), pygame.SRCALPHA)
            pygame.draw.circle(self.sprite2, (255, 100, 100, 255), (32, 32), 28)
            pygame.draw.circle(self.sprite2, (200, 0, 0, 255), (32, 32), 12)
        
        # Scale sprites (make them bigger for visibility)
        sprite_scale = 4
        w1, h1 = self.sprite1.get_size()
        w2, h2 = self.sprite2.get_size()
        self.sprite1 = pygame.transform.scale(self.sprite1, (w1 * sprite_scale, h1 * sprite_scale))
        self.sprite2 = pygame.transform.scale(self.sprite2, (w2 * sprite_scale, h2 * sprite_scale))
        
        self.sprite1_rect = self.sprite1.get_rect()
        self.sprite2_rect = self.sprite2.get_rect()
        
        # Create physics engine using FULL screen resolution
        self.engine = PhysicsCombatEngine(soul1, soul2)
        print(f"⚔️  Battle arena: {self.engine.screen_width}px wide")
        print(f"⚡ Thor spawns at: {self.engine.fighter1.position:.0f}px")
        print(f"👹 Krampus spawns at: {self.engine.fighter2.position:.0f}px")
        
        # Font for UI overlay
        self.font = pygame.font.Font(None, 48)
        self.small_font = pygame.font.Font(None, 32)
        
        self.clock = pygame.time.Clock()
        self.running = True
        
        # UI toggle
        self.show_ui = True
    
    def draw_health_bar(self, x, y, width, height, current_hp, max_hp, color, name):
        """Draw a health bar with background."""
        # Semi-transparent background
        bg = pygame.Surface((width + 20, height + 60), pygame.SRCALPHA)
        bg.fill((0, 0, 0, 180))
        self.screen.blit(bg, (x - 10, y - 10))
        
        # Health bar
        pygame.draw.rect(self.screen, (100, 0, 0, 255), (x, y, width, height))
        hp_width = int(width * max(0, current_hp / max_hp))
        pygame.draw.rect(self.screen, color, (x, y, hp_width, height))
        pygame.draw.rect(self.screen, (255, 255, 255, 255), (x, y, width, height), 3)
        
        # Name and HP text
        name_text = self.small_font.render(name, True, (255, 255, 255))
        hp_text = self.small_font.render(f"{int(max(0, current_hp))}/{int(max_hp)}", True, (200, 200, 200))
        self.screen.blit(name_text, (x, y + height + 5))
        self.screen.blit(hp_text, (x, y + height + 30))
    
    def draw_projectile(self, projectile):
        """Draw a projectile on desktop."""
        # Y position based on screen center
        y = self.screen_height // 2
        x = int(projectile.pos)
        
        # Draw glowing projectile
        for r in [20, 16, 12, 8]:
            alpha = 255 - (r * 10)
            glow = pygame.Surface((r*2, r*2), pygame.SRCALPHA)
            pygame.draw.circle(glow, (255, 255, 0, alpha), (r, r), r)
            self.screen.blit(glow, (x - r, y - r))
        
        # Draw projectile character
        text = self.font.render(projectile.char, True, (255, 255, 255))
        text_rect = text.get_rect(center=(x, y))
        self.screen.blit(text, text_rect)
    
    def run_battle(self):
        """Main battle loop on desktop."""
        print("\n🎮 DESKTOP BATTLE STARTING!")
        print("💡 Window is CLICK-THROUGH - work normally while they fight!")
        print("   To stop battle: Run 'pkill -f desktop_battle.py' or wait 60 seconds")
        print("   Sprites will move across your actual desktop!\n")
        
        while self.running and self.engine.time < 60.0:
            # Handle events (window is click-through so events are limited)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
            
            # Update physics
            self.engine.move_fighter(self.engine.fighter1, self.engine.fighter2)
            self.engine.move_fighter(self.engine.fighter2, self.engine.fighter1)
            self.engine.attempt_attack(self.engine.fighter1, self.engine.fighter2, 1)
            self.engine.attempt_attack(self.engine.fighter2, self.engine.fighter1, 2)
            self.engine.update_projectiles()
            self.engine.time += self.engine.dt
            
            # Check for winner
            if self.engine.fighter1.hp <= 0 or self.engine.fighter2.hp <= 0:
                break
            
            # Clear with transparent background
            self.screen.fill((0, 0, 0, 0))  # Fully transparent
            
            # Calculate Y position (center-ish of screen)
            y_pos = self.screen_height // 2 - self.sprite1_rect.height // 2
            
            # Draw Thor sprite at physics position
            self.sprite1_rect.x = int(self.engine.fighter1.position)
            self.sprite1_rect.y = y_pos
            self.screen.blit(self.sprite1, self.sprite1_rect)
            
            # Draw Krampus sprite at physics position
            self.sprite2_rect.x = int(self.engine.fighter2.position)
            self.sprite2_rect.y = y_pos
            self.screen.blit(self.sprite2, self.sprite2_rect)
            
            # Draw projectiles
            for proj in self.engine.projectiles:
                self.draw_projectile(proj)
            
            # Draw UI overlay (if enabled)
            if self.show_ui:
                bar_width = 350
                bar_height = 30
                
                # Thor health bar (top left)
                self.draw_health_bar(
                    30, 30, bar_width, bar_height,
                    self.engine.fighter1.hp, self.engine.fighter1.max_hp,
                    (100, 150, 255, 255),
                    "⚡ Thor"
                )
                
                # Krampus health bar (top right)
                self.draw_health_bar(
                    self.screen_width - bar_width - 30, 30, bar_width, bar_height,
                    self.engine.fighter2.hp, self.engine.fighter2.max_hp,
                    (255, 100, 100, 255),
                    "Krampus 👹"
                )
                
                # Timer (center top)
                timer_bg = pygame.Surface((200, 50), pygame.SRCALPHA)
                timer_bg.fill((0, 0, 0, 180))
                self.screen.blit(timer_bg, (self.screen_width // 2 - 100, 30))
                
                timer_text = self.font.render(f"{self.engine.time:.1f}s", True, (255, 255, 255))
                timer_rect = timer_text.get_rect(center=(self.screen_width // 2, 55))
                self.screen.blit(timer_text, timer_rect)
                
                # Battle log (bottom center)
                if self.engine.last_action:
                    action_text = self.small_font.render(self.engine.last_action, True, (255, 255, 255))
                    action_rect = action_text.get_rect(center=(self.screen_width // 2, self.screen_height - 50))
                    
                    # Background for action text
                    bg_rect = action_rect.inflate(30, 20)
                    action_bg = pygame.Surface(bg_rect.size, pygame.SRCALPHA)
                    action_bg.fill((0, 0, 0, 200))
                    self.screen.blit(action_bg, bg_rect.topleft)
                    pygame.draw.rect(self.screen, (255, 255, 255), bg_rect, 2)
                    
                    self.screen.blit(action_text, action_rect)
            
            pygame.display.flip()
            self.clock.tick(20)  # 20 FPS
        
        # Show winner overlay for 5 seconds
        self.show_winner()
        self.engine.save_battle_log()
        
        # Auto-exit after showing winner
        print("\n⏸️  Battle complete! Exiting in 5 seconds...")
        import time
        time.sleep(5)
        
        pygame.quit()
        print("✅ Battle overlay closed")
    
    def show_winner(self):
        """Display winner overlay on desktop."""
        # Semi-transparent overlay
        overlay = pygame.Surface((self.screen_width, self.screen_height), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 200))
        self.screen.blit(overlay, (0, 0))
        
        if self.engine.fighter1.hp > 0:
            winner_text = "⚡ THOR WINS! ⚡"
            color = (100, 200, 255)
        else:
            winner_text = "👹 KRAMPUS WINS! 👹"
            color = (255, 100, 100)
        
        huge_font = pygame.font.Font(None, 120)
        winner = huge_font.render(winner_text, True, color)
        winner_rect = winner.get_rect(center=(self.screen_width // 2, self.screen_height // 2))
        self.screen.blit(winner, winner_rect)
        
        instruction = self.small_font.render("Press ESC to exit", True, (255, 255, 255))
        inst_rect = instruction.get_rect(center=(self.screen_width // 2, self.screen_height // 2 + 100))
        self.screen.blit(instruction, inst_rect)
        
        pygame.display.flip()
        
        print(f"\n{'='*60}")
        print(winner_text.center(60))
        print(f"{'='*60}")


def create_soul(entity_key: str, rarity: str, level: int) -> Soul:
    """Create a soul for testing."""
    soul = Soul(
        soul_id=f"test_{entity_key}",
        entity_key=entity_key,
        rarity=rarity,
        obtained_event='test',
        obtained_date='2024-01-01',
        verified_hash=f"test_{entity_key}"
    )
    soul.level = level
    return soul


if __name__ == "__main__":
    print("\n" + "═" * 70)
    print("🖥️  DESKTOP BATTLE - SMASH BROS STYLE 🖥️".center(70))
    print("═" * 70)
    print("\n⚡ Thor vs Krampus 👹")
    print("\nSprites will move directly on your desktop!")
    print("No window borders - transparent overlay over your desktop.")
    print("\nLevel 100 Battle starting in 3 seconds...\n")
    
    import time
    for i in range(3, 0, -1):
        print(f"  {i}...")
        time.sleep(1)
    
    print("\n🎮 GO!")
    
    # Create souls
    thor = create_soul('thor', 'celestial', 100)
    krampus = create_soul('krampus', 'demonic', 100)
    
    # Run desktop battle
    try:
        renderer = DesktopBattleRenderer('thor.png', 'krampus.png', thor, krampus)
        renderer.run_battle()
        print("\n✅ Battle complete! Check logs/ for full battle log")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
