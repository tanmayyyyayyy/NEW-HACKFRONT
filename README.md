# SkillForge

The current repository-history chatbot, public explorer, private team handover, and hackathon materials are in [skillforge/](skillforge/README.md). Run its commands from that directory. For a new Render service use [the SkillForge Blueprint](skillforge/render.yaml) with service root `skillforge`.

## Earlier integrated prototype

# SkillForge Integrated

SkillForge Integrated helps students, developers, and working professionals rank their GitHub repositories by code quality, explore how files and functions connect in an interactive graph, and practice data structures and algorithms through real-world coding tests. Repository findings and test results can support a portfolio and career plan.

The workspace includes public GitHub scans, an interactive code graph, project-aware repository rankings, scenario coding tests, and a portfolio and learning plan. Read the [configuration and deployment guide](docs/OPERATIONS.md) to run the app and enable live integrations.

[Deploy NEW-HACKFRONT to Render](https://render.com/deploy?repo=https://github.com/tanmayyyyayyy/NEW-HACKFRONT) to create the app and PostgreSQL database from the Blueprint. The included free plan is for demos. See the [Render setup and smoke checks](docs/OPERATIONS.md#deploy-to-render).

Double-click [Run-SkillForge.bat](Run-SkillForge.bat) on Windows or [Run-SkillForge.command](Run-SkillForge.command) on macOS to build and open the local app. Both launchers need Node.js 22.12 or newer and uv.

- [Product requirements](docs/PRD.md)
- [Build plan and release gates](docs/BUILD_PLAN.md)
- [Source review and feature inventory](docs/SOURCE_INVENTORY.md)
- [Configuration and secret handoff](docs/ENVIRONMENT.md)
- [Local setup and staging operations](docs/OPERATIONS.md)
- [Adaptive scoring and comparison rules](docs/SCORING.md)
- [Agent instructions](AGENTS.md)
