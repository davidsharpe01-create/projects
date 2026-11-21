# Siteform

Siteform is a browser-based residential masterplanning review app. A new project starts empty with existing 3D building context at 321 Bradford Street, Birmingham B5 6ET. It stores edits in the browser.

## Run locally

```sh
npm ci
npm test
npm run build
npm run preview
```

Open http://localhost:4173. Use Node.js 24 or newer.

Click the site location badge to enter latitude and longitude and load nearby buildings from OpenFreeMap. Model coordinates are in local metres, with east and south positive. The map transform uses a local approximation at the selected origin.

Draw in either 3D or Plan. On wide screens, the toolbar shows each drawing and editing tool directly. Click each boundary corner or frontage vertex in order. Double-click the last point or press **Finish** to complete the drawing. Draw frontages so the building projects to the right of the drawing direction. Click a building once to select its ground spline and drag the frontage handles in either view. In 3D, drag the roof of a selected apartment block up or down to add or remove storeys. Double-click a building to enter floor editing. Click an upper floor in 3D or choose it under **Setback floor**, then drag either blue frontage end. Upper floors retain their setbacks until the dragged floor reaches them. Any upper floor that would overhang then moves inward to match. Click empty space to finish editing. Choose **Boundary → Edit boundary** to drag the redline vertices. Right-drag or middle-drag to orbit in 3D. Left-drag away from editing handles to pan in Select. Hold middle and left together to pan while editing. In Plan, middle-drag pans. Scroll to zoom around the cursor and use **Fit model** to frame the site and blocks. Use **Export** for CSV or a JSON copy.

## Architecture and measurements

React manages workspace state and undo transactions. The TypeScript geometry model calculates footprints, site containment and areas independently. A Canvas renderer projects local geometry into 3D and plan and exposes hit targets for block selection. Mapbox Satellite supplies a faded aerial layer. Mapbox Streets v8 supplies existing building footprints and indicative heights, with OpenFreeMap as the fallback. OpenFreeMap supplies street names. **Aerial imagery**, **Street names** and **Existing buildings** can be toggled independently. Choose **Ghost** in the main toolbar and click context buildings to show dotted outlines for the session. Use **Show** to restore individual buildings or **Layers → Restore all existing buildings** to restore them together. Turn it off under **Display layers → Existing buildings**. Heights are indicative. Local storage keeps a single design option.

External floor area is the footprint measured to the outside face on each floor. House usable area is measured to internal faces, with 600 mm external walls and 300 mm party walls apportioned to adjacent units. All units use the typology depth set by an internal terraced unit. End units stay flush with the run and consequently have less usable area. Complete 4.5 m units fit independently on each straight segment. The overview shows indicative gross internal area (GIA) for all blocks, measured inside the modelled external walls and including internal partitions. Office and PBSA start at editable depths of 18 m and 16 m respectively. PBSA bed counts are pending.

Select an apartment block and choose **Subdivide into apartments** to generate a schematic plan. Switch floors in Plan to review the stacked layout and use **Remove subdivision** to restore the indicative GIA-based estimate. Generated apartment counts feed homes and density. The solver supports straight frontages, single- and double-loaded corridors, core placement, end setbacks and mixed ground floor uses. Its area targets start from the [nationally described space standard](https://www.gov.uk/government/publications/technical-housing-standards-nationally-described-space-standard/technical-housing-standards-nationally-described-space-standard). Travel distance and higher-risk thresholds are schematic checks.

## Cloudflare Pages

The `siteform` Pages project deploys from `main` in the Git repository. The build root is `siteform`, the command is `npm run build`, and the output is `public`. Set `MAPBOX_PUBLIC_TOKEN` in the production build environment to enable Mapbox. Restrict the public token to the app origin in the Mapbox dashboard.

## Later phases

Detailed apartment and compliance checks, surveyed terrain and existing buildings, setbacks along other faces, development mix, shared projects and option locking, and DXF export are future phases.
