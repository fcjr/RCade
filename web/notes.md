Public Pages:
- Home
  - Description
  - Popular Games
- Games
  - Full list
- Game
  - Specific Game

Private Pages:
- Profile
  - My games
- \[MODIFY] Game
  - lets you change the game info
- Create Game
  - Creates a new game

-----

## Manifest

```ts
export type Author = {
    recurse_id?: number,
    display_name?: string,
    visibility?: "public" | "private",
}

export type Manifest = {
    name: string,
    description: string,
    authors: Author | Author[],
    visibility?: "personal" | "private" | "public",

    version?: SemVer,
}

export type Game = {
    manifest: Manifest,
    owner: number, // recurse id
    github_repo: {
        name: string,
        owner: string,
    }
}
```

-----

## Api Routes
Base: /api/v1/

### `GET /games`
gets a game info by id

### `GET /games/{id}`
gets a game info by id

### `POST /deployments/{name}`
