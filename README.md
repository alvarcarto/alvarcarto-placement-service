# alvarcarto-placement-service

> Place-it image service


## Get started

1. Install node environment
1. Install [GraphicsMagick](https://github.com/aheckmann/gm#getting-started) with **ImageMagick**
1. `npm i`
1. `cp .env.sample .env` and fill the blanks
1. `npm start`



### Testing convert commands

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