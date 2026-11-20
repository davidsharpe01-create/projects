# Siteform

Siteform is a browser-based residential masterplanning review app. The initial project includes a sample site, two apartment envelopes and one house run. It stores edits in the browser.

## Run locally

```sh
npm ci
npm test
npm run build
npm run preview
```

Open http://localhost:4173. Use Node.js 24 or newer.

Click the site location badge to enter latitude and longitude and load an OpenStreetMap basemap. The original context is illustrative. Model coordinates are in local metres, with east and south positive. The map transform uses a local approximation at the selected origin.

Click each boundary corner or frontage vertex in order and press **Finish**. Draw frontages so the building projects to the right of the drawing direction. Click a building to inspect its properties and drag its frontage handles in either view. In 3D, drag the roof of a selected apartment block up or down to add or remove storeys. Click empty space to finish editing. To edit the redline vertices, clear the building selection and press **E**. With Select active, left-drag to pan. Right-drag in 3D to orbit, shift-drag to pan while editing, and scroll to zoom. Use **Export** for CSV or a JSON copy.

## Architecture and measurements

React manages workspace state and undo transactions. The TypeScript geometry model calculates footprints, site containment and areas independently. A Canvas renderer projects local geometry into 3D and plan and exposes hit targets for block selection. OpenStreetMap tiles supply optional geographic context. Local storage keeps a single design option.

External floor area is the footprint measured to the outside face on each floor. House usable area is measured to internal faces, with 600 mm external walls and 300 mm party walls apportioned to adjacent units. End units are deeper where the external wall reduces clear frontage. Complete 4.5 m units fit independently on each straight segment. The overview shows indicative gross internal area (GIA) for all blocks, measured inside the modelled external walls and including internal partitions. Apartment layouts are pending.

## Cloudflare Pages

The `siteform` Pages project deploys from `main` in the Git repository. The build root is `siteform`, the command is `npm run build`, and the output is `public`.

## Later phases

Apartment layouts and standards checks, surveyed terrain and existing buildings, direct floor and setback editing, development mix, shared projects and option locking, and DXF export are future phases.
