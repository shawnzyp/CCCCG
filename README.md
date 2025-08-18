# Catalyst Core Character Tracker

Hosted version of the mobile-optimized character sheet for GitHub Pages.

## CCCG PDF
The rules modal loads `docs/CCCCG - Catalyst Core Character Creation Guide.pdf`. If redistribution of this PDF is restricted, obtain it from the official Catalyst Core release and place the file in the `docs/` directory with the same name.

## Firebase configuration
For production deployments, supply the Firebase config JSON at runtime. You can embed it directly in `Index.html`:

```html
<script type="application/json" id="firebase-config">
{ "apiKey": "...", "authDomain": "...", "projectId": "..." }
</script>
```

Alternatively, expose the same JSON via environment variables and inject it into the page during your build or deployment process.
