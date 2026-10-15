#!/bin/zsh
# Every cut of both takes: 1080p with the camera, 1080p of the whole window, stills, and the site's 960 × 540 with
# its poster (site/, for magHome's public/captures/edunet/).
#   ./cuts.sh [takes-dir] [out-dir]      (defaults: ../../raw, which holds take-ko/ and take-en/ from take.mjs; ../..)
set -e
here=${0:A:h}; takes=${${1:-$here/../../raw}:A}; out=${${2:-$here/../..}:A}
mkdir -p $out/real-use $out/site
for L in ko en; do
  node $here/edit.mjs $takes/take-$L $out/site/use-$L.mp4 --size 960x540 --crf 25
  node $here/edit.mjs $takes/take-$L $out/real-use/netgongbu-use-$L-1080p.mp4 --size 1920x1080 --crf 20 --stills $out/real-use
  node $here/edit.mjs $takes/take-$L $out/real-use/netgongbu-use-$L-wide-1080p.mp4 --size 1920x1080 --crf 20 --wide
  cp $out/site/use-$L.mp4 $out/real-use/netgongbu-use-$L-540p.mp4
  # the poster is the first frame: the clip starts there and fades back to it to loop
  ffmpeg -v error -y -i $out/real-use/netgongbu-use-$L-1080p.mp4 -frames:v 1 $out/site/first-$L.png
  magick $out/site/first-$L.png -resize 960x540 -quality 82 $out/site/use-$L-poster.webp
  rm $out/site/first-$L.png
done
ls -la $out/site $out/real-use
