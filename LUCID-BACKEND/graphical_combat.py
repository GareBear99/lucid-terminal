#!/usr/local/opt/python@3.10/bin/python3.10
"""
🎮 Graphical Combat System
Renders actual sprite images using the physics engine coordinates
"""
import sys
import os
import pygame
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.physics_combat_engine import PhysicsCombatEngine, get_screen_resolution
from core.soul_system_v2 import Soul

class GraphicalCombatRenderer:
    """Renders combat using actual sprites."""
    
    def __init__(self, sprite1_path: str, sprite2_path: str, soul1: Soul, soul2: Soul):
        """Initialize pygame and load sprites."""
        pygame.init()
        
        # Get screen resolution
        self.screen_width, self.screen_height = get_screen_resolution()
        
        # Create fullscreen or windowed display
        try:
            self.screen = pygame.display.set_mode((self.screen_width, self.screen_height))
        except:
            # Fallback to windowed
            self.screen = pygame.display.set_mode((1280, 720))
            self.screen_width, self.screen_height = 1280, 720
        
        pygame.display.set_caption("Soul Combat Arena")
        
        # Load sprites
        try:
            self.sprite1 = pygame.image.load(sprite1_path).convert_alpha()
            self.sprite2 = pygame.image.load(sprite2_path).convert_alpha()
        except Exception as e:
            print(f"Error loading sprites: {e}")
            print("Creating placeholder sprites...")
            # Create placeholder colored rectangles
            self.sprite1 = pygame.Surface((64, 64))
            self.sprite1.fill((100, 100, 255))  # Blue
            self.sprite2 = pygame.Surface((64, 64))
            self.sprite2.fill((255, 100, 100))  # Red
        
        # Scale sprites if needed (optional)
        sprite_scale = 2  # 2x scale
        w1, h1 = self.sprite1.get_size()
        w2, h2 = self.sprite2.get_size()
        self.sprite1 = pygame.transform.scale(self.sprite1, (w1 * sprite_scale, h1 * sprite_scale))
        self.sprite2 = pygame.transform.scale(self.sprite2, (w2 * sprite_scale, h2 * sprite_scale))
        
        self.sprite1_rect = self.sprite1.get_rect()
        self.sprite2_rect = self.sprite2.get_rect()
        
        # Create physics engine
        self.engine = PhysicsCombatEngine(soul1, soul2)
        
        # Font for UI
        self.font = pygame.font.Font(None, 36)
        self.small_font = pygame.font.Font(None, 24)
        
        self.clock = pygame.time.Clock()
        self.running = True
    
    def draw_health_bar(self, x, y, width, height, current_hp, max_hp, color):
        """Draw a health bar."""
        # Background (red)
        pygame.draw.rect(self.screen, (100, 0, 0), (x, y, width, height))
        # Foreground (current HP)
        hp_width = int(width * (current_hp / max_hp))
        pygame.draw.rect(self.screen, color, (x, y, hp_width, height))
        # Border
        pygame.draw.rect(self.screen, (255, 255, 255), (x, y, width, height), 2)
    
    def draw_projectile(self, projectile):
        """Draw a projectile."""
        # Calculate Y position (middle of screen)
        y = self.screen_height // 2
        
        # Draw projectile as a colored circle or character
        color = (255, 255, 0)  # Yellow
        pygame.draw.circle(self.screen, color, (int(projectile.pos), y), 8)
        
        # Optionally draw the character
        text = self.small_font.render(projectile.char, True, (255, 255, 255))
        self.screen.blit(text, (int(projectile.pos) - 10, y - 10))
    
    def run_battle(self):
        """Main battle loop."""
        while self.running and self.engine.time < 60.0:
            # Handle events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
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
            
            # Draw
            self.screen.fill((20, 20, 30))  # Dark background
            
            # Draw sprites at physics positions
            # Y position is centered vertically
            y_pos = self.screen_height // 2 - self.sprite1_rect.height // 2
            
            # Fighter 1 (left)
            self.sprite1_rect.x = int(self.engine.fighter1.position)
            self.sprite1_rect.y = y_pos
            self.screen.blit(self.sprite1, self.sprite1_rect)
            
            # Fighter 2 (right)
            self.sprite2_rect.x = int(self.engine.fighter2.position)
            self.sprite2_rect.y = y_pos
            self.screen.blit(self.sprite2, self.sprite2_rect)
            
            # Draw projectiles
            for proj in self.engine.projectiles:
                self.draw_projectile(proj)
            
            # Draw health bars
            bar_width = 300
            bar_height = 30
            
            # Fighter 1 health bar (top left)
            self.draw_health_bar(
                20, 20, bar_width, bar_height,
                self.engine.fighter1.hp, self.engine.fighter1.max_hp,
                (100, 100, 255)
            )
            name1 = self.font.render(f"{self.engine.fighter1.soul.entity['name']}", True, (255, 255, 255))
            self.screen.blit(name1, (20, 55))
            
            # Fighter 2 health bar (top right)
            self.draw_health_bar(
                self.screen_width - bar_width - 20, 20, bar_width, bar_height,
                self.engine.fighter2.hp, self.engine.fighter2.max_hp,
                (255, 100, 100)
            )
            name2 = self.font.render(f"{self.engine.fighter2.soul.entity['name']}", True, (255, 255, 255))
            name2_rect = name2.get_rect()
            self.screen.blit(name2, (self.screen_width - 20 - name2_rect.width, 55))
            
            # Draw timer
            timer_text = self.font.render(f"Time: {self.engine.time:.1f}s", True, (255, 255, 255))
            timer_rect = timer_text.get_rect(center=(self.screen_width // 2, 30))
            self.screen.blit(timer_text, timer_rect)
            
            # Draw last action
            if self.engine.last_action:
                action_text = self.small_font.render(self.engine.last_action, True, (200, 200, 200))
                action_rect = action_text.get_rect(center=(self.screen_width // 2, self.screen_height - 30))
                self.screen.blit(action_text, action_rect)
            
            pygame.display.flip()
            self.clock.tick(20)  # 20 FPS
        
        # Show winner
        self.show_winner()
        self.engine.save_battle_log()
        
        # Wait for close
        waiting = True
        while waiting:
            for event in pygame.event.get():
                if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                    waiting = False
        
        pygame.quit()
    
    def show_winner(self):
        """Display winner screen."""
        overlay = pygame.Surface((self.screen_width, self.screen_height))
        overlay.set_alpha(200)
        overlay.fill((0, 0, 0))
        self.screen.blit(overlay, (0, 0))
        
        if self.engine.fighter1.hp > 0:
            winner_text = f"{self.engine.fighter1.soul.entity['emoji']} {self.engine.fighter1.soul.entity['name']} WINS!"
            color = (100, 100, 255)
        else:
            winner_text = f"{self.engine.fighter2.soul.entity['emoji']} {self.engine.fighter2.soul.entity['name']} WINS!"
            color = (255, 100, 100)
        
        big_font = pygame.font.Font(None, 72)
        winner = big_font.render(winner_text, True, color)
        winner_rect = winner.get_rect(center=(self.screen_width // 2, self.screen_height // 2))
        self.screen.blit(winner, winner_rect)
        
        instruction = self.small_font.render("Press ESC to exit", True, (255, 255, 255))
        inst_rect = instruction.get_rect(center=(self.screen_width // 2, self.screen_height // 2 + 60))
        self.screen.blit(instruction, inst_rect)
        
        pygame.display.flip()


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
    print("\n" + "═" * 80)
    print("🎮 GRAPHICAL SOUL COMBAT SYSTEM 🎮".center(80))
    print("═" * 80)
    print("\nThis version renders actual sprite images on screen!")
    print("Sprites move using the physics engine's screen resolution coordinates.")
    print()
    print("Place your sprite images in the current directory:")
    print("  - thor.png or thor.jpg")
    print("  - krampus.png or krampus.jpg")
    print()
    print("Or enter custom paths below.")
    print("═" * 80)
    print()
    
    # Get sprite paths
    sprite1 = input("Path to Thor sprite (or press ENTER for placeholder): ").strip()
    if not sprite1:
        sprite1 = "thor.png"
    
    sprite2 = input("Path to Krampus sprite (or press ENTER for placeholder): ").strip()
    if not sprite2:
        sprite2 = "krampus.png"
    
    level = input("Battle level (1-999): ").strip()
    try:
        level = int(level)
        level = max(1, min(999, level))
    except:
        level = 100
    
    print(f"\n🎮 Starting graphical battle at level {level}...")
    print("Controls: ESC to exit")
    print()
    
    # Create souls
    thor = create_soul('thor', 'celestial', level)
    krampus = create_soul('krampus', 'demonic', level)
    
    # Run graphical battle
    try:
        renderer = GraphicalCombatRenderer(sprite1, sprite2, thor, krampus)
        renderer.run_battle()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nMake sure pygame is installed: pip install pygame")
