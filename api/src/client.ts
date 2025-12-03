import { Game } from "./game/index.js";
import { GamesResponse, GameResponse } from "./schema.js";

export class Client {
  public static new() {
    return new Client(undefined);
  }

  public static newKeyed(cabinet_api_key: string) {
    return new Client(cabinet_api_key);
  }

  private constructor(private api_key: string | undefined) {}

  private baseUrl = "https://rcade.dev/api/v1";

  public withBaseUrl(baseUrl: string): this {
    this.baseUrl = baseUrl;
    return this;
  }

  private get headers(): HeadersInit | undefined {
    return this.api_key
      ? { Authorization: `Bearer ${this.api_key}` }
      : undefined;
  }

  public async getAllGames(): Promise<Game[]> {
    const response = await fetch(`${this.baseUrl}/games`, {
      headers: this.headers,
    });
    const list = GamesResponse.parse(await response.json());

    return list.map((g) => Game.fromApiResponse(g));
  }

  public async getGame(gameId: string): Promise<Game> {
    const response = await fetch(`${this.baseUrl}/games/${gameId}`, {
      headers: this.headers,
    });
    return Game.fromApiResponse(await response.json());
  }
}