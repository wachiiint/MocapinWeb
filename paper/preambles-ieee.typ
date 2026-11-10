// IEEE-like conference layout. Content lives in main.typ.
// [Anti-Slop: 70% - @owner - tag part as AI generated]
#let paper(
  title: "",
  authors: (),
  affiliation: "",
  abstract: none,
  keywords: (),
  body,
) = {
  set document(title: title, author: authors)
  set page(paper: "a4", margin: (x: 1.6cm, top: 1.9cm, bottom: 2.5cm), columns: 2, numbering: "1")
  set columns(gutter: 0.5cm)
  set text(font: ("Nimbus Roman", "Libertinus Serif"), size: 10pt, lang: "en")
  set par(justify: true, first-line-indent: 1em, spacing: 0.6em)

  // Headings: "I. INTRODUCTION" then "A. Subsection"
  set heading(numbering: (..n) => {
    let n = n.pos()
    if n.len() == 1 { numbering("I.", ..n) } else { numbering("A.", n.last()) }
  })
  show heading: set text(size: 10pt, weight: "regular")
  show heading.where(level: 1): it => block(above: 1.3em, below: 0.8em, width: 100%, align(center, upper(it)))
  show heading.where(level: 2): it => block(above: 1em, below: 0.6em, emph(it))

  // Title block spans both columns
  place(top + center, float: true, scope: "parent", clearance: 1.5em)[
    #text(size: 22pt, title)
    #v(0.8em)
    #text(size: 11pt, authors.join(", "))
    #v(0.2em)
    #text(size: 9pt, style: "italic", affiliation)
  ]

  set text(size: 9pt, weight: "bold")
  if abstract != none [_Abstract_---#abstract]
  if keywords.len() > 0 [#parbreak()_Index Terms_---#keywords.join(", ")]
  set text(size: 10pt, weight: "regular")

  body
}
