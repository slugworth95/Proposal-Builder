# Proposal-Builder

A starter template for a tool that helps you create, customize, and send client proposals.

## Planned Features

- Proposal editor with reusable sections (scope, timeline, pricing)
- Client and project metadata
- Export to PDF / shareable link
- Version history for proposals

## Getting Started

This is a static web app starter — no build step required.

1. Open `index.html` in your browser, or serve the folder:

   ```bash
   # Python
   python -m http.server 8000

   # or Node
   npx serve .
   ```

2. Open http://localhost:8000 in your browser.

## Project Structure

```
Proposal-Builder/
├── index.html      # Main page
├── css/styles.css  # Styles
├── js/app.js       # App logic
└── README.md
```

## Roadmap

- [ ] Proposal form with dynamic sections
- [ ] Save proposals to localStorage
- [ ] PDF export