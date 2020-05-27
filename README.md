# alvarcarto-placement-service

> Place-it image service


## Get started

1. Install node environment
1. Install [GraphicsMagick](https://github.com/aheckmann/gm#getting-started) with **ImageMagick**
1. `npm i`
1. `cp .env.sample .env` and fill the blanks
1. `npm start`


## Workflow for new placement images

1. Find a stock photo which has a poster with one of the aspect ratios we also sell.

    30x40cm, 12x18inch etc. To find out if aspect ratio is the same, take a physical ruler or
    digitally measure the poster dimensions in the stock photo. Divide width with height, e.g.
    `3.5 / 5 = 0.7`. This would be an exact match with our 70x100cm aspect ratio.

2. Edit the stock photo

    * Remove the existing poster from the image
    * Create and edit a transparent layer on top of where the poster will be placed

        This layer should adjust brightness, add inner shadows, noise, etc to make the map
        underneath look real.

    Good example is https://alvarcarto-placement-assets.s3-eu-west-1.amazonaws.com/images/white-bedroom.psd.

3. Figure an id for the image, for example `white-bedroom`

4. Create metadata json

    Good basic example is:

    ```json
    {
      "label": "White bedroom",
      "posterBlur": 0.5,
      "posterSize": "24x36inch",
      "posterOrientation": "portrait"
    }
    ```

    The json also supports `"variableBlur": 7` which will affect the `-blur-layer.png` blur amount.
    See `aarnes-home-table` to see an example of variable blur applied.

4. Export assets to ./images in the repo root

    Necessary assets are:

    * `white-bedroom.json` Contains metadata for placement
    * `white-bedroom.png` Contains the background (and transparent adjustment layer on top of poster)
    * `white-bedroom-guide-layer.png` Contains red dots to guide where map will be placed and green dots for a possible crop.

    Optional assets are:

    * `white-bedroom-blur-layer.png` Which can be used for gradiental blurs

5. Open local placement url and start iterating

    http://localhost:4000/api/place-map/white-bedroom?swLat=60.029&swLng=24.6974&neLat=60.380&neLng=25.203&mapStyle=bw&posterStyle=sans&labelsEnabled=true&labelHeader=Helsinki&labelSmallHeader=Finland&labelText=60.205%C2%B0N%20%2F%2024.950%C2%B0E

### Testing convert commands

To see what convert commands gm is outputting, run `DEBUG=gm npm start`

```
cd root
convert test2.png -matte -virtual-pixel Edge -affine "0.6027402178,-0.0028657441,360,0.0028024744,0.5621156971,149,0.0000360925,-0.0000079604,1" -transform new.png
convert test2.png -matte -virtual-pixel Transparent -affine "0.6027402178,-0.0028657441,360,0.0028024744,0.5621156971,149,0.0000360925,-0.0000079604,1" -transform new.png
convert test2.png -matte -virtual-pixel Transparent -affine "0.6027402178,-0.0028657441,360,0.0028024744,0.5621156971,149,0.0000360925,-0.0000079604,1" -transform +repage new.png
cd root
ls
convert test2.png -distort Perspective "0,0 360,149 799,0 360,785 799,1119 822,765 0,1119 818,147" new.png
convert test2.png -distort Perspective "0,0 360,149 0,1119 360,785 799,1119 822,765 799,0 818,147" new.png
convert test2.png -virtual-pixel Transparent -distort Perspective "0,0 360,149 0,1119 360,785 799,1119 822,765 799,0 818,147" new.png
convert test2.png -distort Perspective "0,0 360,149 0,1119 360,785 799,1119 822,765 799,0 818,147" new.png
convert test2.png -distort Perspective "0,0 358,145 0,1119 360,785 799,1119 822,765 799,0 819,145" new.png
convert test2.png -distort Perspective "0,0 359,146 0,1119 357,765 799,1119 822,765 799,0 819,145" new.png
convert test2.png -distort Perspective "0,0 358,145 0,1119 357,765 799,1119 822,765 799,0 819,143" new.png
convert test2.png -distort Perspective "0,0 340,2537 0,1119 973,3907 799,1119 2887,3337 799,0 2887,3337" new.png
```