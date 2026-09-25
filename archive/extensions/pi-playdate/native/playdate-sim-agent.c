#include <dispatch/dispatch.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <mach-o/dyld.h>

#define MAIN_FRAME_GLOBAL 0x100fc2348ull
#define DEVICE_CRANK_DOCKED 0x100092da8ull
#define DEVICE_CRANK_CHANGED 0x100092e94ull
#define DEVICE_ACCEL_CHANGED 0x100092f6cull
#define PD_ENTER_MENU 0x100ad1604ull

struct Command {
  char action[32];
  int hasDocked;
  int docked;
  double angle;
  double x;
  double y;
  double z;
};

static uint64_t runtime_addr(uint64_t static_addr) {
  return static_addr + (uint64_t)_dyld_get_image_vmaddr_slide(0);
}

static void *main_frame(void) {
  void *const *slot = (void *const *)runtime_addr(MAIN_FRAME_GLOBAL);
  return slot ? *slot : NULL;
}

static void run_on_main(void (^block)(void)) {
  if (pthread_main_np()) {
    block();
    return;
  }
  dispatch_sync(dispatch_get_main_queue(), block);
}

static void device_crank_docked(int docked) {
  run_on_main(^{
    void *mf = main_frame();
    if (!mf) return;
    void (*fn)(void *, int) = (void (*)(void *, int))runtime_addr(DEVICE_CRANK_DOCKED);
    fn(mf, docked);
  });
}

static void device_crank_changed(double angle) {
  run_on_main(^{
    void *mf = main_frame();
    if (!mf) return;
    void (*fn)(void *, double) = (void (*)(void *, double))runtime_addr(DEVICE_CRANK_CHANGED);
    fn(mf, angle);
  });
}

static void device_accel_changed(double x, double y, double z) {
  run_on_main(^{
    void *mf = main_frame();
    if (!mf) return;
    void (*fn)(void *, double, double, double) =
        (void (*)(void *, double, double, double))runtime_addr(DEVICE_ACCEL_CHANGED);
    fn(mf, x, y, z);
  });
}

static void enter_menu(void) {
  run_on_main(^{
    void (*fn)(void) = (void (*)(void))runtime_addr(PD_ENTER_MENU);
    fn();
  });
}

static int json_bool(const char *s, const char *key, int *out) {
  char pattern[64];
  snprintf(pattern, sizeof(pattern), "\"%s\":", key);
  const char *p = strstr(s, pattern);
  if (!p) return 0;
  p += strlen(pattern);
  while (*p == ' ' || *p == '\t') p++;
  if (!strncmp(p, "true", 4)) {
    *out = 1;
    return 1;
  }
  if (!strncmp(p, "false", 5)) {
    *out = 0;
    return 1;
  }
  return 0;
}

static int json_double(const char *s, const char *key, double *out) {
  char pattern[64];
  snprintf(pattern, sizeof(pattern), "\"%s\":", key);
  const char *p = strstr(s, pattern);
  if (!p) return 0;
  p += strlen(pattern);
  while (*p == ' ' || *p == '\t') p++;
  char *end = NULL;
  double value = strtod(p, &end);
  if (end == p) return 0;
  *out = value;
  return 1;
}

static int json_string(const char *s, const char *key, char *out, size_t out_size) {
  char pattern[64];
  snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
  const char *p = strstr(s, pattern);
  if (!p) return 0;
  p += strlen(pattern);
  const char *end = strchr(p, '"');
  if (!end) return 0;
  size_t len = (size_t)(end - p);
  if (len >= out_size) len = out_size - 1;
  memcpy(out, p, len);
  out[len] = '\0';
  return 1;
}

static int parse_command(const char *line, struct Command *cmd) {
  memset(cmd, 0, sizeof(*cmd));
  if (!json_string(line, "action", cmd->action, sizeof(cmd->action))) return 0;
  if (json_bool(line, "docked", &cmd->docked)) cmd->hasDocked = 1;
  json_double(line, "angle", &cmd->angle);
  json_double(line, "x", &cmd->x);
  json_double(line, "y", &cmd->y);
  json_double(line, "z", &cmd->z);
  return 1;
}

static void handle_command(const struct Command *cmd, FILE *out) {
  if (!strcmp(cmd->action, "ping")) {
    fprintf(out, "{\"ok\":true,\"action\":\"ping\"}\n");
    fflush(out);
    return;
  }
  if (!strcmp(cmd->action, "crankSet")) {
    if (cmd->hasDocked) device_crank_docked(cmd->docked ? 1 : 0);
    device_crank_changed(cmd->angle);
    fprintf(out, "{\"ok\":true,\"action\":\"crankSet\",\"angle\":%.17g", cmd->angle);
    if (cmd->hasDocked) fprintf(out, ",\"docked\":%s", cmd->docked ? "true" : "false");
    fprintf(out, "}\n");
    fflush(out);
    return;
  }
  if (!strcmp(cmd->action, "crankDock")) {
    device_crank_docked(cmd->docked ? 1 : 0);
    fprintf(out, "{\"ok\":true,\"action\":\"crankDock\",\"docked\":%s}\n",
            cmd->docked ? "true" : "false");
    fflush(out);
    return;
  }
  if (!strcmp(cmd->action, "accelSet")) {
    device_accel_changed(cmd->x, cmd->y, cmd->z);
    fprintf(out,
            "{\"ok\":true,\"action\":\"accelSet\",\"x\":%.17g,\"y\":%.17g,\"z\":%.17g}\n",
            cmd->x, cmd->y, cmd->z);
    fflush(out);
    return;
  }
  if (!strcmp(cmd->action, "menuOpen")) {
    enter_menu();
    fprintf(out, "{\"ok\":true,\"action\":\"menuOpen\"}\n");
    fflush(out);
    return;
  }
  fprintf(out, "{\"ok\":false,\"error\":\"unknown action\"}\n");
  fflush(out);
}

static void *server_main(void *_) {
  (void)_;
  char path[108];
  snprintf(path, sizeof(path), "/tmp/pi-playdate-agent-%d.sock", getpid());

  int server_fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (server_fd < 0) return NULL;

  struct sockaddr_un addr;
  memset(&addr, 0, sizeof(addr));
  addr.sun_family = AF_UNIX;
  strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

  unlink(path);
  if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
    close(server_fd);
    return NULL;
  }
  if (listen(server_fd, 8) != 0) {
    unlink(path);
    close(server_fd);
    return NULL;
  }

  while (1) {
    int client_fd = accept(server_fd, NULL, NULL);
    if (client_fd < 0) continue;

    FILE *in = fdopen(client_fd, "r+");
    if (!in) {
      close(client_fd);
      continue;
    }

    char line[1024];
    while (fgets(line, sizeof(line), in)) {
      struct Command cmd;
      if (!parse_command(line, &cmd)) {
        fprintf(in, "{\"ok\":false,\"error\":\"invalid command\"}\n");
        fflush(in);
        continue;
      }
      handle_command(&cmd, in);
    }

    fclose(in);
  }

  return NULL;
}

__attribute__((constructor)) static void start_agent(void) {
  pthread_t thread;
  if (pthread_create(&thread, NULL, server_main, NULL) == 0) {
    pthread_detach(thread);
  }
}
