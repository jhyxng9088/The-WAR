# THE WAR — Development Status

Updated: 2026-09-18

## Current stage

**Stage 1 — World + locked low-poly visual baseline — IN PROGRESS**

### Active slice

Third Stage 1 terrain/control pass:
- rivers use curved Catmull-Rom paths and stronger meanders
- river valleys follow the same curved paths
- mountain ridges remain dramatic but use broader falloff
- plateau transitions are softened
- terrain mesh resolution increased
- terrain uses smooth vertex normals instead of faceted flat shading
- two-finger vertical drag uses a dedicated gesture-mode lock for reliable camera tilt
- pinch zoom and two-finger rotation remain available

### Review gate

Stage 1 remains open until real-device review confirms:
- rivers feel naturally winding
- large mountains read as smooth landforms instead of glitched triangles
- two-finger up/down drag reliably changes camera angle
- pinch and rotation still behave correctly
- mobile performance remains acceptable
