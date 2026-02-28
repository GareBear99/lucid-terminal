#!/usr/local/opt/python@3.10/bin/python3.10
"""
🎮 Sprite Sheet Animator
Extracts and animates Crash Bandicoot sprite sequences
"""
import pygame
import sys
from pathlib import Path

# Sprite sheet configuration
SPRITE_SHEET = "crash_spritesheet.png"

# Action sequences (row, start_col, num_frames, fps)
ACTIONS = {
    'idle': {
        'rows': [0, 1],  # First 2 rows
        'frames_per_row': [6, 4],  # 6 frames in row 0, 4 in row 1
        'fps': 8
    },
    'run': {
        'rows': [2, 3],  # 3rd and 4th rows
        'frames_per_row': [8, 5],
        'fps': 12
    },
    'jump': {
        'rows': [4],  # 5th row
        'frames_per_row': [14],
        'fps': 15
    },
    'block': {
        'rows': [5],  # 6th row
        'frames_per_row': [6],
        'fps': 10
    },
    'combo': {
        'rows': [6],  # 7th row
        'frames_per_row': [14],
        'fps': 18
    },
    'kick': {
        'rows': [7],  # 8th row (roundhouse kick)
        'frames_per_row': [6],
        'fps': 12
    }
}


class SpriteAnimator:
    """Animates sprite sheet sequences."""
    
    def __init__(self, sprite_sheet_path, sprite_width=64, sprite_height=64):
        """Load sprite sheet and extract frames."""
        pygame.init()
        
        # Load sprite sheet
        try:
            self.sprite_sheet = pygame.image.load(sprite_sheet_path).convert_alpha()
            print(f"✅ Loaded sprite sheet: {sprite_sheet_path}")
            sheet_size = self.sprite_sheet.get_size()
            print(f"   Size: {sheet_size[0]}x{sheet_size[1]}")
        except:
            print(f"❌ Could not load {sprite_sheet_path}")
            print("   Please save the sprite sheet image as 'crash_spritesheet.png'")
            sys.exit(1)
        
        self.sprite_width = sprite_width
        self.sprite_height = sprite_height
        
        # Extract all action frames
        self.actions = {}
        self.extract_all_actions()
        
        # Current state
        self.current_action = 'idle'
        self.current_frame = 0
        self.frame_timer = 0
        self.scale = 3  # 3x scale for visibility
        
        print(f"\n📦 Extracted actions:")
        for action, frames in self.actions.items():
            print(f"   {action}: {len(frames)} frames")
    
    def extract_frames(self, row, num_frames):
        """Extract frames from a specific row."""
        frames = []
        for col in range(num_frames):
            x = col * self.sprite_width
            y = row * self.sprite_height
            
            # Extract frame
            frame = pygame.Surface((self.sprite_width, self.sprite_height), pygame.SRCALPHA)
            frame.blit(self.sprite_sheet, (0, 0), (x, y, self.sprite_width, self.sprite_height))
            frames.append(frame)
        
        return frames
    
    def extract_all_actions(self):
        """Extract all action sequences from sprite sheet."""
        for action_name, config in ACTIONS.items():
            frames = []
            
            for i, row in enumerate(config['rows']):
                num_frames = config['frames_per_row'][i]
                row_frames = self.extract_frames(row, num_frames)
                frames.extend(row_frames)
            
            self.actions[action_name] = {
                'frames': frames,
                'fps': config['fps']
            }
    
    def set_action(self, action_name):
        """Change current action."""
        if action_name in self.actions and action_name != self.current_action:
            self.current_action = action_name
            self.current_frame = 0
            self.frame_timer = 0
            print(f"🎬 Action: {action_name}")
    
    def update(self, dt):
        """Update animation frame."""
        action = self.actions[self.current_action]
        fps = action['fps']
        
        self.frame_timer += dt
        
        # Advance frame
        if self.frame_timer >= 1.0 / fps:
            self.frame_timer = 0
            self.current_frame = (self.current_frame + 1) % len(action['frames'])
    
    def get_current_frame(self):
        """Get current frame, scaled."""
        action = self.actions[self.current_action]
        frame = action['frames'][self.current_frame]
        
        # Scale up
        scaled_size = (self.sprite_width * self.scale, self.sprite_height * self.scale)
        return pygame.transform.scale(frame, scaled_size)
    
    def draw(self, screen, x, y):
        """Draw current frame at position."""
        frame = self.get_current_frame()
        screen.blit(frame, (x, y))


class SpriteDemo:
    """Interactive sprite animation demo."""
    
    def __init__(self):
        """Initialize pygame window."""
        pygame.init()
        
        self.screen = pygame.display.set_mode((1200, 800))
        pygame.display.set_caption("Crash Bandicoot Sprite Animator")
        
        self.clock = pygame.time.Clock()
        self.running = True
        
        # Load animator
        self.animator = SpriteAnimator(SPRITE_SHEET)
        
        # Position
        self.x = 400
        self.y = 400
        
        # Movement
        self.vel_x = 0
        self.vel_y = 0
        self.on_ground = True
        self.jump_vel = 0
        self.gravity = 800  # pixels per second^2
        self.ground_y = 400
        
        # Font
        self.font = pygame.font.Font(None, 36)
        self.small_font = pygame.font.Font(None, 24)
        
        print("\n🎮 CONTROLS:")
        print("   Arrow Keys - Move")
        print("   SPACE - Jump")
        print("   Z - Block")
        print("   X - Combo")
        print("   C - Kick")
        print("   ESC - Quit")
    
    def handle_input(self):
        """Handle keyboard input."""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    self.running = False
                elif event.key == pygame.K_SPACE and self.on_ground:
                    # Jump
                    self.jump_vel = -500
                    self.on_ground = False
                    self.animator.set_action('jump')
                elif event.key == pygame.K_z:
                    self.animator.set_action('block')
                elif event.key == pygame.K_x:
                    self.animator.set_action('combo')
                elif event.key == pygame.K_c:
                    self.animator.set_action('kick')
        
        # Movement
        keys = pygame.key.get_pressed()
        self.vel_x = 0
        
        if keys[pygame.K_LEFT]:
            self.vel_x = -300
            if self.on_ground and self.animator.current_action not in ['block', 'combo', 'kick']:
                self.animator.set_action('run')
        elif keys[pygame.K_RIGHT]:
            self.vel_x = 300
            if self.on_ground and self.animator.current_action not in ['block', 'combo', 'kick']:
                self.animator.set_action('run')
        else:
            # Idle if on ground and no special action
            if self.on_ground and self.animator.current_action not in ['block', 'combo', 'kick', 'jump']:
                self.animator.set_action('idle')
        
        # Return to idle after special actions complete
        if self.animator.current_action in ['block', 'combo', 'kick']:
            if self.animator.current_frame == len(self.animator.actions[self.animator.current_action]['frames']) - 1:
                if self.on_ground:
                    self.animator.set_action('idle')
    
    def update(self, dt):
        """Update physics and animation."""
        # Horizontal movement
        self.x += self.vel_x * dt
        self.x = max(0, min(self.x, 1200 - 64 * self.animator.scale))
        
        # Vertical movement (gravity)
        if not self.on_ground:
            self.jump_vel += self.gravity * dt
            self.y += self.jump_vel * dt
            
            # Land
            if self.y >= self.ground_y:
                self.y = self.ground_y
                self.on_ground = True
                self.jump_vel = 0
                if self.vel_x != 0:
                    self.animator.set_action('run')
                else:
                    self.animator.set_action('idle')
        
        # Update animation
        self.animator.update(dt)
    
    def draw(self):
        """Draw scene."""
        # Clear screen
        self.screen.fill((40, 120, 180))  # Sky blue
        
        # Ground
        pygame.draw.rect(self.screen, (80, 160, 80), 
                        (0, self.ground_y + 64 * self.animator.scale, 1200, 400))
        
        # Draw character
        self.animator.draw(self.screen, int(self.x), int(self.y))
        
        # UI - Controls
        controls = [
            "Controls:",
            "←→ Move  SPACE Jump",
            "Z Block  X Combo  C Kick",
            f"Action: {self.animator.current_action}"
        ]
        
        y_offset = 20
        for text in controls:
            surf = self.small_font.render(text, True, (255, 255, 255))
            shadow = self.small_font.render(text, True, (0, 0, 0))
            self.screen.blit(shadow, (12, y_offset + 2))
            self.screen.blit(surf, (10, y_offset))
            y_offset += 30
        
        # FPS
        fps_text = f"FPS: {int(self.clock.get_fps())}"
        fps_surf = self.small_font.render(fps_text, True, (255, 255, 255))
        self.screen.blit(fps_surf, (1100, 20))
        
        pygame.display.flip()
    
    def run(self):
        """Main loop."""
        print("\n🎬 Starting animation demo...")
        
        while self.running:
            dt = self.clock.tick(60) / 1000.0  # Delta time in seconds
            
            self.handle_input()
            self.update(dt)
            self.draw()
        
        pygame.quit()
        print("👋 Demo closed")


if __name__ == "__main__":
    print("\n" + "═" * 70)
    print("🎮 CRASH BANDICOOT SPRITE ANIMATOR 🎮".center(70))
    print("═" * 70)
    
    demo = SpriteDemo()
    demo.run()
