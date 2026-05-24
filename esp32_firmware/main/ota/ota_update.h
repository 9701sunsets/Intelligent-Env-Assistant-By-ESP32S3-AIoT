#ifndef OTA_OSS_H
#define OTA_OSS_H

#include "esp_err.h"

esp_err_t ota_from_signed_url(const char *signed_url, const char *expected_sha256_hex, const char *server_root_ca_pem);

#endif