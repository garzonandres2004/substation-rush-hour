# AI rules (adapted from the kit)

AI is a component, not the architecture. It sits at the edges.

- AI-01 Model for unstructured in, structured out: e.g. a plain English scenario ("what if a heat wave hits Thursday") becomes scenario parameters.
- AI-02 Model for structured in, unstructured out: the plain English explanation of each dispatch decision.
- AI-03 Forecasting, congestion scoring, dispatch optimization, savings math and validation are code. No model in that path.
- AI-04 The model makes no decisions. Rules decide.
- AI-05 Request JSON, validate against a TypeScript type, retry once, then fail with a friendly message.
- AI-06 Call models from a server route only. Keys in env vars.
- AI-07 Keep prompt text in a constants file, not inline.
- AI-08 Cache or seed AI results on the demo path so a slow call cannot break the demo.
- AI-09 Every AI input path has a non AI equivalent (preset scenario buttons).
