# Playdate C API Quick Reference

## Entry Point

```c
#include "pd_api.h"

int eventHandler(PlaydateAPI* pd, PDSystemEvent event, uint32_t arg);
```

## System Events (PDSystemEvent)

| Event | When |
|---|---|
| `kEventInit` | Game loaded. Register update callback here. |
| `kEventInitLua` | Lua runtime ready (hybrid games only). |
| `kEventTerminate` | Game exiting. Free resources. |
| `kEventLock` | Device locked. |
| `kEventUnlock` | Device unlocked. |
| `kEventPause` | Game paused (menu opened). |
| `kEventResume` | Game resumed. |
| `kEventKeyPressed` | Hardware key pressed (arg = keycode). |
| `kEventKeyReleased` | Hardware key released. |

## Update Callback

```c
// Register in kEventInit:
pd->system->setUpdateCallback(update, userdata);

// Called every frame. Return 1 if display was updated.
static int update(void* userdata) {
    PlaydateAPI* pd = (PlaydateAPI*)userdata;
    // game logic here
    return 1;
}
```

## Graphics (pd->graphics)

```c
pd->graphics->clear(kColorWhite);
pd->graphics->drawText("text", strlen("text"), kASCIIEncoding, x, y);
pd->graphics->drawRect(x, y, w, h, kColorBlack);
pd->graphics->fillRect(x, y, w, h, kColorBlack);
pd->graphics->drawLine(x1, y1, x2, y2, 1, kColorBlack);
pd->graphics->drawEllipse(x, y, w, h, 1, 0, 360, kColorBlack);

// Images
LCDBitmap* img = pd->graphics->loadBitmap("images/player", NULL);
pd->graphics->drawBitmap(img, x, y, kBitmapUnflipped);
pd->graphics->freeBitmap(img);

// Bitmap tables
LCDBitmapTable* table = pd->graphics->loadBitmapTable("images/walk", NULL);
LCDBitmap* frame = pd->graphics->getTableBitmap(table, index);
```

## Input (pd->system)

```c
PDButtons current, pushed, released;
pd->system->getButtonState(&current, &pushed, &released);

// Check specific buttons:
if (current & kButtonA) { /* A held */ }
if (pushed & kButtonB)  { /* B just pressed */ }

// Crank
float angle = pd->system->getCrankAngle();       // 0-360
float change = pd->system->getCrankChange();      // delta
int docked = pd->system->isCrankDocked();
```

## Button Constants

`kButtonLeft`, `kButtonRight`, `kButtonUp`, `kButtonDown`, `kButtonA`, `kButtonB`

## Sound (pd->sound)

```c
// File player (music)
FilePlayer* fp = pd->sound->fileplayer->newPlayer();
pd->sound->fileplayer->loadIntoPlayer(fp, "sounds/music");
pd->sound->fileplayer->play(fp, 0); // 0 = loop

// Sample player (SFX)
AudioSample* sample = pd->sound->sample->load("sounds/beep");
SamplePlayer* sp = pd->sound->sampleplayer->newPlayer();
pd->sound->sampleplayer->setSample(sp, sample);
pd->sound->sampleplayer->play(sp, 1, 1.0f);
```

## Memory

```c
void* ptr = pd->system->realloc(NULL, size);   // malloc
ptr = pd->system->realloc(ptr, newSize);        // realloc
pd->system->realloc(ptr, 0);                    // free
```

## Sprites (pd->sprite)

```c
LCDSprite* s = pd->sprite->newSprite();
pd->sprite->setImage(s, bitmap, kBitmapUnflipped);
pd->sprite->moveTo(s, x, y);
pd->sprite->addSprite(s);

// In update:
pd->sprite->updateAndDrawSprites();

pd->sprite->removeSprite(s);
pd->sprite->freeSprite(s);
```

## Display Constants

- Width: 400 pixels
- Height: 240 pixels
- 1-bit display (black and white only)
- Default refresh: 30 FPS (max 50)

Full API: https://sdk.play.date/Inside%20Playdate%20with%20C.html
