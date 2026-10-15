"""Print the OpenAPI schema (JSON) without starting the server.

Used by `npm run gen:api` in frontend/ to generate TypeScript types.
"""

import json

from app.main import app


def main() -> None:
    print(json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
