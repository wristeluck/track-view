#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

int read_record(unsigned char *ptr);
long read_long(unsigned char *ptr);
short read_short(unsigned char *ptr);
float read_float(unsigned char *ptr);
long recover(unsigned char *ptr, unsigned char *max_ptr);
unsigned char *next_separator(unsigned char *ptr, unsigned char *max_ptr);

int record_length[10];
#define SEPARATOR   0
#define TIMESTAMP   1
#define IMU         2
#define PID         3
#define PARAM       4
#define GPS         5
#define QUATERNION  6

union size4 {
  unsigned char bytes[4];
  long l;
  float f;
};

union size2 {
  unsigned char bytes[2];
  short s;
};

int main(int argc, char *argv[]) {
  if(argc != 2) {
    printf("usage: %s <filename>\n", argv[0]);
    return 1;
  }

  record_length[SEPARATOR] = 5;
  record_length[TIMESTAMP] = 5;
  record_length[IMU] = 17;
  record_length[PID] = 17;
  record_length[PARAM] = 18;
  record_length[GPS] = 30;
  record_length[QUATERNION] = 13;

  // open the file
  FILE *fp = fopen(argv[1], "rb");

  // read catalog sector
  long file_size = 1024 * 1024;
  unsigned char *buffer = (unsigned char *)malloc(file_size);
  fread(buffer, file_size, 1, fp);

  // first byte holds the 'current' record
  int current_record = buffer[0];
  printf("current record = %d\n", current_record);

  // next 3 bytes hold the max sector size for the data file
  // can contain 127 records - each 4 bytes
  // each record holds the data sector (23 bits) |  32 bits (4 bytes)
  // and the offset within that sector (9 bits)  |    total

  // print location of separators
  unsigned char *sep_ptr = buffer;
  while((sep_ptr = next_separator(sep_ptr, buffer + file_size)) != 0) {
    printf("separator: %x\n", sep_ptr - buffer);
  }

  // print address of each record
  int record;
  for(record = 0; record < 127; record++) {
    long address = read_long(buffer + 4*record+4);
    printf("%d: %x\n", record, address);
  }

  unsigned char *ptr = buffer + 0x400;
  unsigned char *backtrack = ptr;
  while(ptr - buffer < file_size) {
    int size;

    size = read_record(ptr);
    if(size == -1) {
      // error
      printf("corrupt file, offset: %x\n", ptr - buffer);
      printf("backtrack %x bytes\n", ptr - backtrack);
      size = recover(ptr, buffer + file_size);
      if(size == -1) {
        printf("End of file\n");
        break;
      }
      printf("skipped %d bytes to recover\n", size);
    }
    backtrack = ptr;
    ptr = ptr + size;
  }

  fclose(fp);
  return 0;
}

int read_record(unsigned char *ptr) {
  // read the record ID
  unsigned char id = *ptr;
  int size;
  switch(id) {
  case SEPARATOR:
    if(read_long(ptr + 1) == 0x5AFECA5E) {
      printf("SEPARATOR\n");
      size = record_length[id];
    } else {
      size = -1;
    }
    break;
  case TIMESTAMP:
      size = record_length[id];
    break;
  case IMU:
    {
      long timestamp = read_long(ptr + 1);
      float yaw = read_float(ptr + 5);
      float pitch = read_float(ptr + 9);
      float roll = read_float(ptr + 13);
      printf("IMU: time=%ld, yaw=%f, pitch=%f, roll=%f\n", timestamp, yaw, pitch, roll);
      size = record_length[id];
    }
    break;
  case PID:
    {
      long timestamp = read_long(ptr + 1);
      float target_heading = read_float(ptr + 5);
      float current_heading = read_float(ptr + 9);
      float rudder_angle = read_float(ptr + 13);
      printf("PID: time=%ld, target=%f, heading=%f, rudder=%f\n", timestamp, target_heading, current_heading, rudder_angle);
      size = record_length[id];
    }
    break;
  case PARAM:
    {
      long timestamp = read_long(ptr + 1);
      float kp = read_float(ptr + 5);
      float ki = read_float(ptr + 9);
      float kd = read_float(ptr + 13);
      unsigned char db = *(ptr + 17);
      printf("KPID: time=%ld, kp=%f, ki=%f, kd=%f, deadband=%d\n", timestamp, kp, ki, kd, db);
      size = record_length[id];
    }
    break;
  case GPS:
    {
      long timestamp = read_long(ptr + 1);
      unsigned char strlen = *(ptr + 5);
      char calendar[13];
      strncpy(calendar, ptr+6, 12);
      calendar[12] = '\0';
      float latitude = read_float(ptr + 18);
      float longitude = read_float(ptr + 22);
      float speed = (float)read_short(ptr + 26) / 10;
      float track_angle = (float)read_short(ptr + 28) / 10;
      printf("GPS: time=%ld, cal=%s, lat=%f, long=%f, speed=%f, track=%f\n", timestamp, calendar, latitude, longitude, track_angle);
      size = record_length[id];
    }
    break;
  case QUATERNION:
    {
      long timestamp = read_long(ptr + 1);
      short iw = read_short(ptr + 5);
      short ix = read_short(ptr + 7);
      short iy = read_short(ptr + 9);
      short iz = read_short(ptr + 11);
      float w = (float)iw / 16384.0f;
      float x = (float)ix / 16384.0f;
      float y = (float)iy / 16384.0f;
      float z = (float)iz / 16384.0f;
      float yaw1 = atan2(2*x*y - 2*w*z, 2*w*w + 2*x*x - 1) * 180.0 / M_PI;
      float yaw2 = atan2((float)(ix*iy - iw*iz) * 7.45e-9, (float)(iw*iw + ix*ix - 134217728l) * 7.45e-9)  * 180.0 / M_PI;
      printf("QUATERNION: time=%ld, w=%d, x=%d, y=%d, z=%d, yaw1=%f, yaw2=%f\n", timestamp, iw, ix, iy, iz, yaw1, yaw2);
      size = record_length[id];
    }
    break;
  default:
    printf("***ERROR: Unsupported record: %d\n", id);
    size = -1;
    break;
  };

  return size;
}

short read_short(unsigned char *ptr) {
  union size2 temp;
  memcpy(temp.bytes, ptr, 2);
  return temp.s;
}

long read_long(unsigned char *ptr) {
  union size4 temp;
  memcpy(temp.bytes, ptr, 4);
  return temp.l;
}

float read_float(unsigned char *ptr) {
  union size4 temp;
  memcpy(temp.bytes, ptr, 4);
  return temp.f;
}

long recover(unsigned char *ptr, unsigned char *max_ptr) {
  // scan forward looking for valid ID followed by correct record length followed by valid ID
  int valid = 0;
  long offset = 0;
  while(!valid) {
    ptr++;
    offset++;
    if(*ptr == 0 && read_long(ptr+1) == 0x5AFECA5E)
      valid = 1;
    else if((*ptr >= 1 && *ptr <= 6) && (*(ptr+record_length[*ptr]) >= 0 && *(ptr+record_length[*ptr]) <= 6))
      valid = 1;
    if(ptr > max_ptr)
      return -1;
  }
  return offset;
}

unsigned char safecase[] = { 0, 0x5E, 0xCA, 0xFE, 0x5A };

unsigned char *next_separator(unsigned char *ptr, unsigned char *max_ptr) {
  int state = 0;
  while(ptr <= max_ptr) {
    if(*ptr == safecase[state])
      state++;
    else
      state = 0;
    ptr++;
    if(state == 5)
      return ptr;
  }
  return 0;
}
