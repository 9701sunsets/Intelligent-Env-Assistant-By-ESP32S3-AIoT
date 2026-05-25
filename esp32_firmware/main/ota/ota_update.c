#include "ota_update.h"
#include "esp_log.h"
#include "esp_https_ota.h"
#include "esp_http_client.h"
#include "esp_system.h"
#include "esp_partition.h"
#include "esp_ota_ops.h"

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#define MBEDTLS_DECLARE_PRIVATE_IDENTIFIERS
#include "mbedtls/private/sha256.h"

static const char *TAG = "ota_oss";

/*
 signed_url: 后端生成的带签名的 OSS URL (https://bucket.oss-cn-xxx.aliyuncs.com/...)
 expected_sha256_hex: 小写 hex string，或 NULL 跳过校验
 server_root_ca_pem: 根证书 PEM 字符串
*/

esp_err_t compute_partition_sha256(const esp_partition_t *partition, char out_hex[65]) {
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    if (mbedtls_sha256_starts(&ctx, 0) != 0) {
        return ESP_FAIL;
    }

    const size_t buf_size = 4096;
    uint8_t *buf = (uint8_t *)malloc(buf_size);
    if (!buf) {
        mbedtls_sha256_free(&ctx);
        return ESP_ERR_NO_MEM;
    }

    size_t off = 0;
    while (off < partition->size) {
        size_t to_read = buf_size;
        if (off + to_read > partition->size) to_read = partition->size - off;
        esp_err_t r = esp_partition_read(partition, off, buf, to_read);
        if (r != ESP_OK) {
            free(buf);
            mbedtls_sha256_free(&ctx);
            return r;
        }
        if (mbedtls_sha256_update(&ctx, buf, to_read) != 0) {
            free(buf);
            mbedtls_sha256_free(&ctx);
            return ESP_FAIL;
        }
        off += to_read;
    }
    free(buf);

    unsigned char sha_output[32];
    if (mbedtls_sha256_finish(&ctx, sha_output) != 0) {
        mbedtls_sha256_free(&ctx);
        return ESP_FAIL;
    }
    mbedtls_sha256_free(&ctx);

    for (int i = 0; i < 32; ++i) {
        sprintf(out_hex + i * 2, "%02x", sha_output[i]);
    }
    out_hex[64] = 0;
    return ESP_OK;
}

esp_err_t ota_from_signed_url(const char *signed_url, const char *expected_sha256_hex, const char *server_root_ca_pem) {
    ESP_LOGI(TAG, "Starting OTA from URL: %s", signed_url);

    esp_http_client_config_t http_config = {
        .url = signed_url,
        .timeout_ms = 60000,
        .transport_type = HTTP_TRANSPORT_OVER_SSL,
        .cert_pem = server_root_ca_pem,
        .use_global_ca_store = (server_root_ca_pem == NULL), // 如果没有提供根证书，则使用全局 CA 存储（如果已配置）
    };

    esp_https_ota_config_t ota_config = {
        .http_config = &http_config,
    };

    esp_err_t ret = esp_https_ota(&ota_config);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "esp_https_ota failed: %s", esp_err_to_name(ret));
        return ret;
    }

    const esp_partition_t *update_partition = esp_ota_get_next_update_partition(NULL);
    if (update_partition == NULL) {
        update_partition = esp_ota_get_running_partition();
    }

    char sha_hex[65];
    esp_err_t r = compute_partition_sha256(update_partition, sha_hex);
    if (r != ESP_OK) {
        ESP_LOGE(TAG, "compute sha failed");
        return r;
    }

    ESP_LOGI(TAG, "Computed image sha256: %s", sha_hex);
    if (expected_sha256_hex) {
        if (strcasecmp(expected_sha256_hex, sha_hex) != 0) {
            ESP_LOGE(TAG, "SHA256 mismatch! expected %s != computed %s", expected_sha256_hex, sha_hex);
            return ESP_FAIL;
        }
    }

    ESP_LOGI(TAG, "OTA success, restarting...");
    esp_restart();
    return ESP_OK; // not reached
}