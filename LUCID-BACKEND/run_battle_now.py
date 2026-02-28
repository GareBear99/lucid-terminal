#!/usr/local/opt/python@3.10/bin/python3.10
"""
🎮 Auto-Run Battle - Thor vs Krampus
Starts immediately, no prompts!
"""
import sys
import os
import pygame

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
        print(f"Screen resolution: {self.screen_width}x{self.screen_height}")
        
        # Create windowed display (easier to see)
        window_width = min(1280, self.screen_width)
        window_height = min(720, self.screen_height)
        self.screen = pygame.display.set_mode((window_width, window_height))
        pygame.display.set_caption("⚡ Thor vs Krampus 👹")
        
        # Load sprites
        try:
            self.sprite1 = pygame.image.load(sprite1_path).convert_alpha()
            self.sprite2 = pygame.image.load(sprite2_path).convert_alpha()
            print(f"Loaded sprites: {sprite1_path}, {sprite2_path}")
        except Exception as e:
            print(f"Using placeholder sprites (couldn't load: {e})")
            self.sprite1 = pygame.Surface((64, 64))
            self.sprite1.fill((100, 100, 255))  # Blue for Thor
            self.sprite2 = pygame.Surface((64, 64))
            self.sprite2.fill((255, 100, 100))  # Red for Krampus
        
        # Scale sprites
        sprite_scale = 3
        w1, h1 = self.sprite1.get_size()
        w2, h2 = self.sprite2.get_size()
        self.sprite1 = pygame.transform.scale(self.sprite1, (w1 * sprite_scale, h1 * sprite_scale))
        self.sprite2 = pygame.transform.scale(self.sprite2, (w2 * sprite_scale, h2 * sprite_scale))
        
        self.sprite1_rect = self.sprite1.get_rect()
        self.sprite2_rect = self.sprite2.get_rect()
        
        # Create physics engine (uses full screen resolution for coordinates)
        self.engine = PhysicsCombatEngine(soul1, soul2)
        print(f"Physics arena width: {self.engine.screen_width}px")
        print(f"Thor starts at: {self.engine.fighter1.position:.0f}px")
        print(f"Krampus starts at: {self.engine.fighter2.position:.0f}px")
        
        # Scale factor to map screen coords to window coords
        self.scale_x = window_width / self.screen_width
        
        # Font for UI
        self.font = pygame.font.Font(None, 36)
        self.small_font = pygame.font.Font(None, 24)
        
        self.clock = pygame.time.Clock()
        self.running = True
    
    def draw_health_bar(self, x, y, width, height, current_hp, max_hp, color):
        """Draw a health bar."""
        pygame.draw.rect(self.screen, (100, 0, 0), (x, y, width, height))
        hp_width = int(width * max(0, current_hp / max_hp))
        pygame.draw.rect(self.screen, color, (x, y, hp_width, height))
        pygame.draw.rect(self.screen, (255, 255, 255), (x, y, width, height), 2)
    
    def draw_projectile(self, projectile):
        """Draw a projectile."""
        y = self.screen.get_height() // 2
        x = int(projectile.pos * self.scale_x)
        
        # Draw glow
        for r in [12, 10, 8]:
            alpha = 255 - (r * 20)
            glow = pygame.Surface((r*2, r*2), pygame.SRCALPHA)
            pygame.draw.circle(glow, (255, 255, 0, alpha), (r, r), r)
            self.screen.blit(glow, (x - r, y - r))
        
        # Draw character
        text = self.font.render(projectile.char, True, (255, 255, 255))
        self.screen.blit(text, (x - 10, y - 15))
    
    def run_battle(self):
        """Main battle loop."""
        print("\n🎮 Battle starting!")
        print("Close window or press ESC to exit\n")
        
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
            self.screen.fill((10, 10, 20))  # Dark background
            
            # Draw ground line
            ground_y = self.screen.get_height() // 2 + 100
            pygame.draw.line(self.screen, (50, 50, 70), (0, ground_y), (self.screen.get_width(), ground_y), 2)
            
            # Draw sprites at scaled positions
            y_pos = self.screen.get_height() // 2 - self.sprite1_rect.height // 2
            
            # Fighter 1 (Thor)
            self.sprite1_rect.x = int(self.engine.fighter1.position * self.scale_x)
            self.sprite1_rect.y = y_pos
            self.screen.blit(self.sprite1, self.sprite1_rect)
            
            # Fighter 2 (Krampus)
            self.sprite2_rect.x = int(self.engine.fighter2.position * self.scale_x)
            self.sprite2_rect.y = y_pos
            self.screen.blit(self.sprite2, self.sprite2_rect)
            
            # Draw projectiles
            for proj in self.engine.projectiles:
                self.draw_projectile(proj)
            
            # Draw UI
            bar_width = 300
            bar_height = 25
            
            # Thor health bar (top left)
            self.draw_health_bar(
                20, 20, bar_width, bar_height,
                self.engine.fighter1.hp, self.engine.fighter1.max_hp,
                (100, 150, 255)
            )
            name1 = self.font.render(f"⚡ Thor", True, (255, 255, 255))
            hp1 = self.small_font.render(f"{int(max(0, self.engine.fighter1.hp))}/{int(self.engine.fighter1.max_hp)}", True, (200, 200, 200))
            self.screen.blit(name1, (20, 50))
            self.screen.blit(hp1, (20, 75))
            
            # Krampus health bar (top right)
            sw = self.screen.get_width()
            self.draw_health_bar(
                sw - bar_width - 20, 20, bar_width, bar_height,
                self.engine.fighter2.hp, self.engine.fighter2.max_hp,
                (255, 100, 100)
            )
            name2 = self.font.render(f"Krampus 👹", True, (255, 255, 255))
            hp2 = self.small_font.render(f"{int(max(0, self.engine.fighter2.hp))}/{int(self.engine.fighter2.max_hp)}", True, (200, 200, 200))
            self.screen.blit(name2, (sw - 200, 50))
            self.screen.blit(hp2, (sw - 200, 75))
            
            # Timer
            timer_text = self.font.render(f"Time: {self.engine.time:.1f}s", True, (255, 255, 255))
            timer_rect = timer_text.get_rect(center=(sw // 2, 30))
            self.screen.blit(timer_text, timer_rect)
            
            # Battle log
            if self.engine.last_action:
                action_text = self.small_font.render(self.engine.last_action, True, (200, 200, 200))
                action_rect = action_text.get_rect(center=(sw // 2, self.screen.get_height() - 30))
                
                # Background box for action
                bg_rect = action_rect.inflate(20, 10)
                pygame.draw.rect(self.screen, (0, 0, 0, 180), bg_rect)
                pygame.draw.rect(self.screen, (255, 255, 255), bg_rect, 1)
                
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
        overlay = pygame.Surface(self.screen.get_size())
        overlay.set_alpha(220)
        overlay.fill((0, 0, 0))
        self.screen.blit(overlay, (0, 0))
        
        if self.engine.fighter1.hp > 0:
            winner_text = "⚡ THOR WINS! ⚡"
            color = (100, 150, 255)
        else:
            winner_text = "👹 KRAMPUS WINS! 👹"
            color = (255, 100, 100)
        
        big_font = pygame.font.Font(None, 72)
        winner = big_font.render(winner_text, True, color)
        winner_rect = winner.get_rect(center=(self.screen.get_width() // 2, self.screen.get_height() // 2))
        self.screen.blit(winner, winner_rect)
        
        instruction = self.small_font.render("Press ESC or close window to exit", True, (200, 200, 200))
        inst_rect = instruction.get_rect(center=(self.screen.get_width() // 2, self.screen.get_height() // 2 + 60))
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
    print("\n" + "═" * 60)
    print("⚡ THOR vs KRAMPUS 👹".center(60))
    print("═" * 60)
    print("\nLevel 100 Battle - Auto-starting!\n")
    
    # Create souls
    thor = create_soul('thor', 'celestial', 100)
    krampus = create_soul('krampus', 'demonic', 100)
    
    # Run graphical battle
    try:
        renderer = GraphicalCombatRenderer('thor.png', 'krampus.png', thor, krampus)
        renderer.run_battle()
        print("\n✅ Battle complete! Check logs/ for battle log")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
