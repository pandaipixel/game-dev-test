# Flying Ruby

A Flappy-Bird-style arcade game with a Pandai twist. The mascot flies through
a procedurally generated course, collecting rubies, with a fixed **3-minute
round** before the run ends.

Part of the [JDP Games](../) collection — published via GitHub Pages.

## Run it locally

The game is a static site, so any local web server will work. For example:

```bash
# from inside the flying-ruby folder
python3 -m http.server 8080
# then open http://localhost:8080
```

You can't open `index.html` directly in a browser — the scenes are loaded as
ES modules, which browsers only allow over `http://` (not `file://`).

## Project structure

```
flying-ruby/
├── index.html              # entry point — loads Phaser + main.js
├── src/
│   ├── config.js           # palette + gameplay constants
│   ├── main.js             # Phaser game config and scene registration
│   └── scenes/
│       ├── BootScene.js    # asset loading + placeholder texture factory
│       ├── StartScene.js   # title screen with play button (this iteration)
│       ├── GameScene.js    # gameplay (stub — full version next)
│       └── GameOverScene.js  # results (stub — full version next)
├── assets/
│   ├── sprites/            # bird, ruby, obstacles (PNG, ideally @2x)
│   ├── backgrounds/        # parallax layers, sky, clouds
│   ├── buttons/            # button states (idle / hover / pressed)
│   └── ui/                 # icons, panels, numbers, fonts
├── sfx/                    # short sound effects (.mp3 or .ogg)
└── bgm/                    # looping background music tracks
```

### Asset naming

When you drop files in, please match these names so `BootScene.preload()` can
swap them in without code changes:

| Key      | File                        | Notes                                |
|----------|-----------------------------|--------------------------------------|
| `bird`   | `assets/sprites/bird.png`   | ~56×44 ideally, transparent          |
| `ruby`   | `assets/sprites/ruby.png`   | ~36×36, transparent                  |
| `pipe`   | `assets/sprites/pipe.png`   | vertical, ~64 wide, ≥600 tall        |
| `bg`     | `assets/backgrounds/sky.png`| 480×854 (or 2× = 960×1708)           |
| `btn-play` | `assets/buttons/play.png` | with idle/hover/pressed sprites      |

If a real asset is missing, `BootScene` falls back to a generated placeholder
shape using the brand palette.

## Color palette

Sourced from the [Pandai Design System 1.5](https://www.figma.com/design/Y0DLhf2MGdGwG0jyjN7EbQ/Pandai-Design-System-1.5--WIP---BACKUP-?node-id=1390-161):

| Token       | Hex       | Used for                       |
|-------------|-----------|--------------------------------|
| navy        | `#020d26` | sky background, deep shadow    |
| royalBlue   | `#1535a8` | mid sky, obstacles             |
| darkRed     | `#a21520` | shadows, danger accents        |
| ruby        | `#b81c26` | mascot, ruby pickups           |
| yellow      | `#fdd83d` | highlights, buttons, score     |
| orange      | `#ffb800` | glow, sun, accent              |

Constants live in [src/config.js](src/config.js).
