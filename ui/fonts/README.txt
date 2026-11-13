gowun-batang-bold.woff2: Gowun Batang Bold (Gowun font project), used for headings, stamps and labels.
Subset to Latin + the Korean characters listed in subset-korean.txt (other Korean text falls back to Malgun Gothic).
Licensed under the SIL Open Font License 1.1: https://openfontlicense.org
Source: https://github.com/google/fonts/tree/main/ofl/gowunbatang

To add characters: put them in subset-korean.txt, then run
  python -m fontTools.subset GowunBatang-Bold.ttf --text-file=subset-korean.txt \
    --unicodes="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026" \
    --flavor=woff2 --layout-features='*' --output-file=gowun-batang-bold.woff2
(needs: python -m pip install fonttools brotli)
