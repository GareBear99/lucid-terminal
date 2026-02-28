#!/usr/local/opt/python@3.10/bin/python3.10
"""
Test sprite extraction - generate test sheet and extract individual frames
"""
import pygame
import os

def create_test_sprite_sheet():
    """Create a test sprite sheet with colored squares."""
    print("Creating test sprite sheet...")
    
    pygame.init()
    
    # Create sprite sheet: 10 frames x 8 rows
    frame_width = 64
    frame_height = 64
    frames_per_row = 10
    num_rows = 8
    
    sheet_width = frame_width * frames_per_row
    sheet_height = frame_height * num_rows
    
    sheet = pygame.Surface((sheet_width, sheet_height), pygame.SRCALPHA)
    sheet.fill((0, 0, 0, 0))  # Transparent background
    
    # Draw test frames (different colors per row)
    colors = [
        (255, 100, 100),  # Red - idle row 1
        (255, 150, 100),  # Orange - idle row 2
        (100, 255, 100),  # Green - run row 1
        (100, 255, 150),  # Light green - run row 2
        (100, 100, 255),  # Blue - jump
        (255, 255, 100),  # Yellow - block
        (255, 100, 255),  # Magenta - combo
        (100, 255, 255),  # Cyan - kick
    ]
    
    for row in range(num_rows):
        for col in range(frames_per_row):
            x = col * frame_width
            y = row * frame_height
            
            # Draw colored square
            color = colors[row]
            pygame.draw.rect(sheet, color, (x + 5, y + 5, frame_width - 10, frame_height - 10))
            pygame.draw.rect(sheet, (255, 255, 255), (x + 5, y + 5, frame_width - 10, frame_height - 10), 2)
            
            # Draw frame number
            font = pygame.font.Font(None, 24)
            text = font.render(f"R{row}F{col}", True, (0, 0, 0))
            text_rect = text.get_rect(center=(x + frame_width//2, y + frame_height//2))
            sheet.blit(text, text_rect)
    
    # Save sprite sheet
    pygame.image.save(sheet, "test_spritesheet.png")
    print(f"✅ Created test_spritesheet.png ({sheet_width}x{sheet_height})")
    
    return sheet, frame_width, frame_height


def extract_row(sprite_sheet, row, frame_width, frame_height, num_frames):
    """Extract all frames from a specific row."""
    print(f"\nExtracting row {row} ({num_frames} frames)...")
    
    frames = []
    
    for col in range(num_frames):
        x = col * frame_width
        y = row * frame_height
        
        # Extract frame
        frame = pygame.Surface((frame_width, frame_height), pygame.SRCALPHA)
        frame.blit(sprite_sheet, (0, 0), (x, y, frame_width, frame_height))
        frames.append(frame)
        
        # Save individual frame
        filename = f"extracted_row{row}_frame{col}.png"
        pygame.image.save(frame, filename)
        print(f"  ✅ Saved {filename}")
    
    return frames


def display_extracted_frames(frames, row_num):
    """Display extracted frames in a window with animation."""
    print(f"\nDisplaying row {row_num} animation...")
    
    screen = pygame.display.set_mode((800, 600))
    pygame.display.set_caption(f"Row {row_num} Animation Test")
    
    clock = pygame.time.Clock()
    current_frame = 0
    frame_timer = 0
    fps = 8  # 8 frames per second
    scale = 3
    
    running = True
    while running:
        dt = clock.tick(60) / 1000.0
        
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
        
        # Update frame
        frame_timer += dt
        if frame_timer >= 1.0 / fps:
            frame_timer = 0
            current_frame = (current_frame + 1) % len(frames)
        
        # Draw
        screen.fill((40, 40, 40))
        
        # Scale and center frame
        frame = frames[current_frame]
        scaled_frame = pygame.transform.scale(frame, (frame.get_width() * scale, frame.get_height() * scale))
        x = 400 - scaled_frame.get_width() // 2
        y = 300 - scaled_frame.get_height() // 2
        screen.blit(scaled_frame, (x, y))
        
        # Info text
        font = pygame.font.Font(None, 36)
        info = f"Row {row_num} - Frame {current_frame}/{len(frames)-1}"
        text = font.render(info, True, (255, 255, 255))
        screen.blit(text, (20, 20))
        
        help_text = font.render("ESC to quit", True, (200, 200, 200))
        screen.blit(help_text, (20, 550))
        
        pygame.display.flip()
    
    pygame.quit()


def main():
    print("═" * 60)
    print("SPRITE EXTRACTION TEST".center(60))
    print("═" * 60)
    
    # Step 1: Create test sprite sheet
    sheet, frame_w, frame_h = create_test_sprite_sheet()
    
    # Step 2: Extract row 0 (idle animation)
    row_to_extract = 0
    num_frames = 10
    
    frames = extract_row(sheet, row_to_extract, frame_w, frame_h, num_frames)
    
    print(f"\n✅ Successfully extracted {len(frames)} frames from row {row_to_extract}")
    print(f"   Individual files saved as: extracted_row{row_to_extract}_frameX.png")
    
    # Step 3: Display animation
    display_extracted_frames(frames, row_to_extract)
    
    print("\n✅ Test complete!")


if __name__ == "__main__":
    main()
