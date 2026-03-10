# VCE Database

Simple Next.js app for browsing VCE exam questions from `data.json` using taxonomy from `config/subject_taxonomy.json`.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy (GitHub Pages)

This repo includes a GitHub Actions workflow that:

1. Builds the app on pushes to `main`
2. Publishes the static export (`out/`) to GitHub Pages
3. Automatically uses the correct base path for either user pages (`/`) or project pages (`/<repo>`)

After pushing these changes, in GitHub go to:
`Settings -> Pages -> Build and deployment -> Source` and set it to `GitHub Actions`.
