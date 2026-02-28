#!/usr/local/opt/python@3.10/bin/python3.10
"""
🎮 Desktop Battle - Native macOS Transparent Overlay
Uses Cocoa/PyObjC for true transparency
"""
import sys
import os
from pathlib import Path
from threading import Thread
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.physics_combat_engine import PhysicsCombatEngine, get_screen_resolution
from core.soul_system_v2 import Soul

# macOS Cocoa imports
from Cocoa import (
    NSApplication, NSWindow, NSView, NSColor, NSBezierPath, NSFont, NSImage,
    NSRect, NSPoint, NSSize, NSMakeRect, NSMakePoint, NSMakeSize,
    NSFloatingWindowLevel, NSBorderlessWindowMask, NSBackingStoreBuffered,
    NSGraphicsContext, NSCompositingOperationSourceOver, NSTimer,
    NSForegroundColorAttributeName
)
from AppKit import NSApp
from PyObjCTools import AppHelper


class TransparentView(NSView):
    """Custom view for rendering battle on transparent background."""
    
    def initWithFrame_engine_sprite1_sprite2_(self, frame, engine, sprite1_path, sprite2_path):
        """Initialize view with physics engine and sprites."""
        self = super(TransparentView, self).initWithFrame_(frame)
        if self is None:
            return None
        
        self.engine = engine
        self.running = True
        
        # Load sprite images
        try:
            self.sprite1 = NSImage.alloc().initWithContentsOfFile_(str(Path(sprite1_path).resolve()))
            self.sprite2 = NSImage.alloc().initWithContentsOfFile_(str(Path(sprite2_path).resolve()))
            print(f"✅ Loaded sprites")
        except:
            self.sprite1 = None
            self.sprite2 = None
            print("⚠️  Could not load sprites, using colored circles")
        
        # Scale sprites if loaded
        if self.sprite1:
            size = self.sprite1.size()
            self.sprite1.setSize_(NSMakeSize(size.width * 4, size.height * 4))
        if self.sprite2:
            size = self.sprite2.size()
            self.sprite2.setSize_(NSMakeSize(size.width * 4, size.height * 4))
        
        # Setup fonts
        self.font = NSFont.boldSystemFontOfSize_(40)
        self.small_font = NSFont.systemFontOfSize_(24)
        self.tiny_font = NSFont.systemFontOfSize_(18)
        
        # Start update timer (50ms = 20 FPS)
        self.timer = NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            0.05, self, 'timerFired:', None, True
        )
        
        return self
    
    def timerFired_(self, timer):
        """Update physics and trigger redraw."""
        if not self.running:
            return
        
        # Physics update
        self.engine.move_fighter(self.engine.fighter1, self.engine.fighter2)
        self.engine.move_fighter(self.engine.fighter2, self.engine.fighter1)
        self.engine.attempt_attack(self.engine.fighter1, self.engine.fighter2, 1)
        self.engine.attempt_attack(self.engine.fighter2, self.engine.fighter1, 2)
        self.engine.update_projectiles()
        self.engine.time += self.engine.dt
        
        # Check for winner or timeout
        if self.engine.fighter1.hp <= 0 or self.engine.fighter2.hp <= 0 or self.engine.time >= 60.0:
            self.running = False
            self.timer.invalidate()
            
            # Save battle log
            self.engine.save_battle_log()
            
            # Show winner for 5 seconds then close
            def close_window():
                time.sleep(5)
                NSApp.terminate_(None)
            Thread(target=close_window, daemon=True).start()
        
        # Redraw
        self.setNeedsDisplay_(True)
    
    def drawRect_(self, rect):
        """Draw battle scene."""
        # Clear to transparent
        NSColor.clearColor().set()
        NSBezierPath.fillRect_(rect)
        
        # Get bounds
        bounds = self.bounds()
        width = bounds.size.width
        height = bounds.size.height
        
        # Draw fighters
        y_pos = height / 2 - 64
        
        # Fighter 1 (Thor)
        x1 = self.engine.fighter1.position
        if self.sprite1:
            self.sprite1.drawAtPoint_fromRect_operation_fraction_(
                NSMakePoint(x1, y_pos),
                NSMakeRect(0, 0, 0, 0),  # Use full image
                NSCompositingOperationSourceOver,
                1.0
            )
        else:
            # Fallback: blue circle
            NSColor.colorWithRed_green_blue_alpha_(0.4, 0.6, 1.0, 1.0).set()
            path = NSBezierPath.bezierPathWithOvalInRect_(NSMakeRect(x1, y_pos, 64, 64))
            path.fill()
        
        # Fighter 2 (Krampus)
        x2 = self.engine.fighter2.position
        if self.sprite2:
            self.sprite2.drawAtPoint_fromRect_operation_fraction_(
                NSMakePoint(x2, y_pos),
                NSMakeRect(0, 0, 0, 0),
                NSCompositingOperationSourceOver,
                1.0
            )
        else:
            # Fallback: red circle
            NSColor.colorWithRed_green_blue_alpha_(1.0, 0.4, 0.4, 1.0).set()
            path = NSBezierPath.bezierPathWithOvalInRect_(NSMakeRect(x2, y_pos, 64, 64))
            path.fill()
        
        # Draw projectiles
        for proj in self.engine.projectiles:
            x = proj.pos
            y = height / 2
            
            # Glow effect
            NSColor.colorWithRed_green_blue_alpha_(1.0, 1.0, 0.0, 0.5).set()
            glow = NSBezierPath.bezierPathWithOvalInRect_(NSMakeRect(x - 15, y - 15, 30, 30))
            glow.fill()
            
            # Projectile char
            proj_str = proj.char
            attrs = {NSForegroundColorAttributeName: NSColor.whiteColor()}
            proj_str.drawAtPoint_withAttributes_(NSMakePoint(x - 10, y - 20), attrs)
        
        # Draw health bars
        self.draw_health_bar(30, height - 100, 350, 30,
                           self.engine.fighter1.hp, self.engine.fighter1.max_hp,
                           NSColor.colorWithRed_green_blue_alpha_(0.4, 0.6, 1.0, 1.0),
                           "⚡ Thor")
        
        self.draw_health_bar(width - 380, height - 100, 350, 30,
                           self.engine.fighter2.hp, self.engine.fighter2.max_hp,
                           NSColor.colorWithRed_green_blue_alpha_(1.0, 0.4, 0.4, 1.0),
                           "Krampus 👹")
        
        # Draw timer
        timer_bg = NSColor.colorWithRed_green_blue_alpha_(0.0, 0.0, 0.0, 0.8)
        timer_bg.set()
        timer_rect = NSMakeRect(width / 2 - 80, height - 100, 160, 50)
        NSBezierPath.fillRect_(timer_rect)
        
        # Timer border
        NSColor.whiteColor().set()
        NSBezierPath.strokeRect_(timer_rect)
        
        # Timer text
        timer_text = f"{self.engine.time:.1f}s"
        attrs = {NSForegroundColorAttributeName: NSColor.whiteColor()}
        timer_text.drawAtPoint_withAttributes_(NSMakePoint(width / 2 - 40, height - 90), attrs)
        
        # Draw battle log
        if self.engine.last_action:
            log_text = self.engine.last_action
            attrs = {NSForegroundColorAttributeName: NSColor.whiteColor()}
            
            # Background
            log_bg = NSColor.colorWithRed_green_blue_alpha_(0.0, 0.0, 0.0, 0.9)
            log_bg.set()
            log_rect = NSMakeRect(width / 2 - 300, 30, 600, 40)
            NSBezierPath.fillRect_(log_rect)
            NSColor.whiteColor().set()
            NSBezierPath.strokeRect_(log_rect)
            
            # Text
            log_text.drawAtPoint_withAttributes_(NSMakePoint(width / 2 - 280, 40), attrs)
        
        # Draw winner if battle ended
        if not self.running:
            # Dark overlay
            overlay = NSColor.colorWithRed_green_blue_alpha_(0.0, 0.0, 0.0, 0.85)
            overlay.set()
            NSBezierPath.fillRect_(bounds)
            
            # Winner text
            if self.engine.fighter1.hp > 0:
                winner_text = "⚡ THOR WINS! ⚡"
                color = NSColor.colorWithRed_green_blue_alpha_(0.4, 0.8, 1.0, 1.0)
            else:
                winner_text = "👹 KRAMPUS WINS! 👹"
                color = NSColor.colorWithRed_green_blue_alpha_(1.0, 0.4, 0.4, 1.0)
            
            attrs = {NSForegroundColorAttributeName: color}
            winner_font = NSFont.boldSystemFontOfSize_(80)
            winner_text.drawAtPoint_withAttributes_(NSMakePoint(width / 2 - 400, height / 2), attrs)
    
    def draw_health_bar(self, x, y, width, height, current_hp, max_hp, color, name):
        """Draw health bar with background."""
        # Background panel
        panel_bg = NSColor.colorWithRed_green_blue_alpha_(0.0, 0.0, 0.0, 0.8)
        panel_bg.set()
        panel_rect = NSMakeRect(x - 10, y - 10, width + 20, height + 70)
        NSBezierPath.fillRect_(panel_rect)
        
        # Health bar background
        NSColor.colorWithRed_green_blue_alpha_(0.3, 0.0, 0.0, 1.0).set()
        NSBezierPath.fillRect_(NSMakeRect(x, y, width, height))
        
        # Health bar fill
        hp_width = width * max(0, current_hp / max_hp)
        color.set()
        NSBezierPath.fillRect_(NSMakeRect(x, y, hp_width, height))
        
        # Health bar border
        NSColor.whiteColor().set()
        NSBezierPath.strokeRect_(NSMakeRect(x, y, width, height))
        
        # Name text
        attrs = {NSForegroundColorAttributeName: NSColor.whiteColor()}
        name.drawAtPoint_withAttributes_(NSMakePoint(x, y + height + 5), attrs)
        
        # HP text
        hp_text = f"{int(max(0, current_hp))}/{int(max_hp)}"
        hp_color = NSColor.colorWithRed_green_blue_alpha_(0.8, 0.8, 0.8, 1.0)
        attrs = {NSForegroundColorAttributeName: hp_color}
        hp_text.drawAtPoint_withAttributes_(NSMakePoint(x, y + height + 30), attrs)


def create_soul(entity_key: str, rarity: str, level: int) -> Soul:
    """Create test soul."""
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


def run_battle():
    """Start transparent overlay battle."""
    print("\n" + "═" * 70)
    print("🖥️  DESKTOP BATTLE - NATIVE COCOA OVERLAY 🖥️".center(70))
    print("═" * 70)
    
    # Create souls
    thor = create_soul('thor', 'celestial', 100)
    krampus = create_soul('krampus', 'demonic', 100)
    
    # Get screen resolution
    screen_width, screen_height = get_screen_resolution()
    print(f"Desktop resolution: {screen_width}x{screen_height}")
    
    # Create physics engine
    engine = PhysicsCombatEngine(thor, krampus)
    print(f"⚔️  Battle starting at 20 FPS")
    
    # Create app
    app = NSApplication.sharedApplication()
    
    # Create transparent window
    window = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
        NSMakeRect(0, 0, screen_width, screen_height),
        NSBorderlessWindowMask,
        NSBackingStoreBuffered,
        False
    )
    
    # Configure transparency
    window.setOpaque_(False)
    window.setBackgroundColor_(NSColor.clearColor())
    window.setLevel_(NSFloatingWindowLevel)
    window.setIgnoresMouseEvents_(True)
    window.setAlphaValue_(1.0)
    window.setHasShadow_(False)
    
    # Create view
    frame = NSMakeRect(0, 0, screen_width, screen_height)
    view = TransparentView.alloc().initWithFrame_engine_sprite1_sprite2_(
        frame, engine, 'thor.png', 'krampus.png'
    )
    
    window.setContentView_(view)
    window.makeKeyAndOrderFront_(None)
    
    print("\n🎮 BATTLE STARTING!")
    print("Window is transparent - sprites overlay your desktop")
    print("Window is click-through - work normally while they fight")
    print("Battle will auto-close when finished\n")
    
    # Run app
    AppHelper.runEventLoop()


if __name__ == "__main__":
    try:
        run_battle()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
