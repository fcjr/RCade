# /// script
# requires-python = ">=3.11"
# dependencies = ["pygame-ce"]
# ///

import asyncio
import pygame

# RCade game dimensions
WIDTH = 336
HEIGHT = 262
FPS = 60

# Colors
BACKGROUND = (26, 26, 46)
WHITE = (255, 255, 255)
P1_COLOR = (100, 200, 255)
P1_COLOR_A = (255, 100, 100)
P1_COLOR_B = (100, 255, 100)
P2_COLOR = (255, 200, 100)
P2_COLOR_A = (255, 100, 255)
P2_COLOR_B = (100, 255, 255)


class Player:
    def __init__(self, x, y, color, color_a, color_b):
        self.x = x
        self.y = y
        self.color = color
        self.color_a = color_a
        self.color_b = color_b
        self.speed = 4
        self.size = 20

    def update(self, inputs):
        if inputs["up"]:
            self.y -= self.speed
        if inputs["down"]:
            self.y += self.speed
        if inputs["left"]:
            self.x -= self.speed
        if inputs["right"]:
            self.x += self.speed

        # Keep in bounds
        half = self.size // 2
        self.x = max(half, min(WIDTH - half, self.x))
        self.y = max(half, min(HEIGHT - half, self.y))

    def draw(self, screen, inputs):
        if inputs["a"]:
            color = self.color_a
        elif inputs["b"]:
            color = self.color_b
        else:
            color = self.color
        pygame.draw.circle(screen, color, (self.x, self.y), self.size // 2)


class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("{{display_name}}")
        self.clock = pygame.time.Clock()
        self.running = True
        self.game_started = False
        self.two_player = False

        # Players
        self.p1 = Player(WIDTH // 3, HEIGHT // 2, P1_COLOR, P1_COLOR_A, P1_COLOR_B)
        self.p2 = Player(2 * WIDTH // 3, HEIGHT // 2, P2_COLOR, P2_COLOR_A, P2_COLOR_B)

        # Font
        self.font_large = pygame.font.Font(None, 36)
        self.font_small = pygame.font.Font(None, 24)

    def update(self, inputs):
        if not self.game_started:
            if inputs["system"]["start_1p"]:
                self.game_started = True
                self.two_player = False
            elif inputs["system"]["start_2p"]:
                self.game_started = True
                self.two_player = True
            return

        self.p1.update(inputs["p1"])
        if self.two_player:
            self.p2.update(inputs["p2"])

    def draw(self, inputs):
        self.screen.fill(BACKGROUND)

        if not self.game_started:
            text1 = self.font_large.render("Press START", True, WHITE)
            text2 = self.font_small.render("1P or 2P", True, WHITE)
            text3 = self.font_small.render("Use D-PAD to move", True, WHITE)
            self.screen.blit(text1, text1.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 20)))
            self.screen.blit(text2, text2.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 10)))
            self.screen.blit(text3, text3.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 40)))
        else:
            self.p1.draw(self.screen, inputs["p1"])
            if self.two_player:
                self.p2.draw(self.screen, inputs["p2"])

        pygame.display.flip()

    async def run(self):
        while self.running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False

            # Get input from RCade controls (bridged from JS)
            inputs = _get_input().to_py()

            self.update(inputs)
            self.draw(inputs)
            self.clock.tick(FPS)
            await asyncio.sleep(0)

        pygame.quit()


async def main():
    game = Game()
    await game.run()


asyncio.run(main())
