# SkillForge

SkillForge helps developers trace why a repository changed and verify the evidence in GitHub. The primary flows are asking a repository question, exploring a saved or newly indexed repository graph, and reviewing the guided source traces.

## Platform

Responsive web. The repository explorer and graph are task interfaces. Guided traces and the homepage introduce the workflow with verifiable examples.

## Product constraints

Show the scope of sampled evidence. Keep explicit PR references distinct from inferred behavior. Keep private graph access scoped to the signed-in user and recheck GitHub access before serving a private repository index.
