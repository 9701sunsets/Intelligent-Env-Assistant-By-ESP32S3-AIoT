#ifndef __COMFORT_AI_H__
#define __COMFORT_AI_H__

#ifdef __cplusplus
extern "C" {
#endif

const char *comfort_ai_evaluate(float temperature, float humidity, int light);

#ifdef __cplusplus
}
#endif

#endif // __COMFORT_AI_H__