# 🎨 Media Assets Directory

This directory contains sprite images and visual assets for the Soul Combat System.

## 📁 Structure

```
media/
├── sprites/          # Soul character sprites
│   ├── thor.png
│   ├── apollo.png
│   ├── krampus.png
│   └── ...
├── weapons/          # Weapon icon sprites
│   ├── mjolnir.png
│   ├── apollo_bow.png
│   └── ...
└── effects/          # Visual effects (projectiles, impacts)
    ├── projectiles/
    └── impacts/
```

## 🎮 Usage

The combat system can use these sprites for:
- **Graphical Battles** (`graphical_combat.py`) - Full pygame window battles
- **Desktop Battles** (`desktop_battle.py`) - Transparent overlay battles on your desktop
- **Tournament Displays** - Visual representation of fighters

## 📐 Sprite Specifications

### Character Sprites
- **Format**: PNG with transparency
- **Recommended Size**: 64x64 or 128x128 pixels
- **Naming**: `{entity_key}.png` (e.g., `thor.png`, `apollo.png`)

### Weapon Sprites
- **Format**: PNG with transparency
- **Recommended Size**: 32x32 or 64x64 pixels
- **Naming**: `{weapon_key}.png` (e.g., `mjolnir.png`, `apollo_bow.png`)

## 🎨 Placeholder Generation

If sprites are not available, the graphical system will generate colored placeholder shapes automatically.

## 📝 Notes

- All sprites should have transparent backgrounds
- Higher resolution sprites will be scaled down automatically
- The system supports both .png and .jpg formats
