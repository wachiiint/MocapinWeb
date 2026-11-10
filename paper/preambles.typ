// Readable single-column layout for team review (IEEE layout later). Content lives in main.typ.
#let paper(
  title: "",
  authors: (),
  affiliation: "",
  abstract: none,
  keywords: (),
  body,
) = {
  set document(title: title, author: authors)
  set page(paper: "a4", margin: 2.5cm, numbering: "1")
  set text(font: ("Nimbus Roman", "Libertinus Serif"), size: 11pt, lang: "en")
  set par(justify: true, spacing: 1em)
  set heading(numbering: "1.1")
  show heading: set block(above: 1.6em, below: 0.9em)
  set math.equation(numbering: "(1)")

  // Tables: caption on top, bold header row, may break across pages
  set table(stroke: 0.5pt + luma(170), inset: 5pt)
  show table: set text(size: 9.5pt)
  show table.cell.where(y: 0): set text(weight: "bold")
  show figure.where(kind: table): set figure.caption(position: top)
  show figure.where(kind: table): set block(breakable: true)

  align(center)[
    #text(size: 18pt, weight: "bold", title)
    #v(0.6em)
    #authors.join(", ")
    #v(0.2em)
    #text(style: "italic", affiliation)
  ]
  v(1em)

  if abstract != none {
    block(inset: (x: 1.5em))[
      *Abstract.* #abstract
      #if keywords.len() > 0 [#parbreak()*Index Terms.* #keywords.join(", ")]
    ]
  }

  body
}
