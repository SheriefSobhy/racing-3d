# Credits

Highway Blitz uses these free assets. All of them allow commercial use.
CC0 assets need no attribution; we list them anyway. The one CC BY asset is credited as its license requires.

| Asset | Used for | Author | License | Source |
|---|---|---|---|---|
| Car Concept | Player cars (all 4 Garage cars are recoloured versions) | Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH. Based on "FREE Concept Car 004" by Unity Fan (CC0) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Khronos glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) |
| Kloofendal 48d Partly Cloudy (Pure Sky) | Sky background and reflections | Greg Zaal, Jarod Guest | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) |
| Asphalt 02 | Road surface | Poly Haven | CC0 | [Poly Haven](https://polyhaven.com/a/asphalt_02) |
| Leafy Grass | Grass | Poly Haven | CC0 | [Poly Haven](https://polyhaven.com/a/leafy_grass) |
| Brushed Concrete | Road shoulders, roofs | Poly Haven | CC0 | [Poly Haven](https://polyhaven.com/a/brushed_concrete) |
| Pine Bark | Tree trunks | Poly Haven | CC0 | [Poly Haven](https://polyhaven.com/a/pine_bark) |
| Concrete Road Barrier 02 | Roadside barriers | Amal Kumar | CC0 | [Poly Haven](https://polyhaven.com/a/concrete_road_barrier_02) |
| Street Lamp 01 | Street lamps | Josh Dean | CC0 | [Poly Haven](https://polyhaven.com/a/street_lamp_01) |
| Facade 005, Facade 006, Facade 018A, Facade 020A | Building walls | ambientCG (Lennart Demes) | CC0 | [ambientCG](https://ambientcg.com/list?q=facade) |
| Leaf Set 019, Leaf Set 024 | Pine and leafy tree billboards | ambientCG (Lennart Demes) | CC0 | [ambientCG](https://ambientcg.com/list?q=leafset) |
| Pure Raceway | Music (re-encoded to 96 kbps MP3) | MintoDog | CC0 | [OpenGameArt](https://opengameart.org/content/pure-raceway) |
| Russo One (font) | UI text | Jovanny Lemonad | [SIL Open Font License 1.1](https://openfontlicense.org/) | [Google Fonts](https://fonts.google.com/specimen/Russo+One) |

## Changes made to the assets

- **Car Concept:** all Khronos and 3D Commerce logos removed (licence plate, logo texture, tyre sidewall texture and normal map). Hidden and small parts removed (wipers, pedals, brake pads, door internals and others). Simplified from 213k to about 48k triangles. Transmission glass replaced with simple tinted glass. Textures converted to WebP at 1024 px or less, and meshopt-compressed. Recoloured in the game for each Garage car (Vortex GT, Kestrel RS, Solaris X, Umbra Z9 are our own names).
- **Sky:** resized to a 2048 × 1024 WebP for the background and a 512 × 256 HDR for reflections.
- **Textures:** resized and converted to WebP. Lane markings and curbs are painted onto the asphalt texture.
- **Trees:** billboard images composed from the ambientCG leaf and branch atlases and Poly Haven pine bark.
- **Barrier and lamp:** simplified (barrier to 46 triangles, lamp to about 2k), textures at 512 px WebP, meshopt-compressed.

Engine and sound effects are synthesised in code with the Web Audio API (no audio files).

The scripts that produced these files are in [`tools/`](tools/).
