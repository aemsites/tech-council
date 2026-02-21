# Hero Video Block

Full-width hero section with a video background. Uses `/assets/@tech-council/assets/file.webm` by default.

## Usage

Add a section with the `hero-video` block. Optionally configure via block table:

| Key        | Value                          |
|------------|--------------------------------|
| video      | URL or path to video (optional)|
| heading    | Overlay heading text           |
| title      | Alias for heading             |
| description| Overlay description            |
| cta        | Button URL (link)              |

## Example

```
| video      | /assets/@tech-council/assets/file.webm |
| heading    | Welcome to Tech Council               |
| description| Building the future together          |
| cta        | https://example.com/get-started       |
```

With no config, the block shows the default video with no overlay.
