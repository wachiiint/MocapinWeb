# Tpyst quick tutorial
[Anti-Slop: 100% - @wachi - กูเขียนเอง]

## Prerequistle
Install Typst (Pick one)
```sh
# linux
cargo install --locked typst-cli #build from source
# Windows
winget install typst
# Mac
brew install typst
```
Install Extension \
If u use vs code, go to `extension` -> install `Tinymist Typst`

Install fonts \
(idk, use recommned Eng fonts for IEEE, ACM)

Verify
```sh
tpyst --version
```
Compile
```
typst watch paper/main.typ

```

## Basic
How it works compare to markdown, see more in `tryout.typ`
```
Blank line to new paragraph
= Header
== Subheader
*bold*
- item
+ numbered item
`code`
#link("url")[text]
_italic_
// comment
$x^2$ inline math
$ x^2 $ math on own line
#figure(image("a.png"), caption: [Caption])
#table(columns: 2, [a], [b], [c], [d])
@key cite paper from refs.bib
= Intro <intro>   then refer with @intro
-- en dash, --- em dash
```

## Run
```bash
# hot reload
typst watch paper/main.typ paper/draft.pdf 
# export
typst compile paper/main.typ paper/draft.pdf
```