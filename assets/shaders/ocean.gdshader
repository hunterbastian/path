shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

// Colors
uniform vec4 deep_color : source_color = vec4(0.05, 0.15, 0.3, 0.9);
uniform vec4 shallow_color : source_color = vec4(0.1, 0.4, 0.5, 0.7);
uniform vec4 foam_color : source_color = vec4(0.9, 0.95, 1.0, 1.0);

// Waves
uniform float wave_speed : hint_range(0.0, 2.0) = 0.8;
uniform float wave_height : hint_range(0.0, 3.0) = 0.6;
uniform float wave_frequency : hint_range(0.0, 5.0) = 1.5;
uniform float wave_direction : hint_range(0.0, 6.28) = 0.5;

// Foam
uniform float foam_threshold : hint_range(0.0, 1.0) = 0.6;
uniform float foam_edge_width : hint_range(0.0, 5.0) = 2.0;

// Reflection
uniform float reflectivity : hint_range(0.0, 1.0) = 0.4;
uniform float fresnel_power : hint_range(1.0, 8.0) = 3.0;

varying float wave_y;
varying vec3 world_pos;

// Gerstner wave function
vec3 gerstner_wave(vec2 pos, float time, vec2 dir, float freq, float amp, float speed) {
    float phase = dot(dir, pos) * freq + time * speed;
    float s = sin(phase);
    float c = cos(phase);
    return vec3(
        dir.x * amp * c,
        amp * s,
        dir.y * amp * c
    );
}

void vertex() {
    world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    vec2 pos = world_pos.xz;
    float t = TIME * wave_speed;

    vec2 dir1 = vec2(cos(wave_direction), sin(wave_direction));
    vec2 dir2 = vec2(cos(wave_direction + 1.2), sin(wave_direction + 1.2));
    vec2 dir3 = vec2(cos(wave_direction + 2.8), sin(wave_direction + 2.8));

    vec3 w1 = gerstner_wave(pos, t, dir1, wave_frequency, wave_height, 1.0);
    vec3 w2 = gerstner_wave(pos, t, dir2, wave_frequency * 1.3, wave_height * 0.5, 1.2);
    vec3 w3 = gerstner_wave(pos, t, dir3, wave_frequency * 2.1, wave_height * 0.25, 0.8);

    vec3 wave = w1 + w2 + w3;
    VERTEX.y += wave.y;
    VERTEX.x += wave.x;
    VERTEX.z += wave.z;
    wave_y = wave.y;

    // Recalculate normal from wave derivatives
    float eps = 0.1;
    vec3 wave_dx = gerstner_wave(pos + vec2(eps, 0.0), t, dir1, wave_frequency, wave_height, 1.0)
                 + gerstner_wave(pos + vec2(eps, 0.0), t, dir2, wave_frequency * 1.3, wave_height * 0.5, 1.2);
    vec3 wave_dz = gerstner_wave(pos + vec2(0.0, eps), t, dir1, wave_frequency, wave_height, 1.0)
                 + gerstner_wave(pos + vec2(0.0, eps), t, dir2, wave_frequency * 1.3, wave_height * 0.5, 1.2);

    vec3 tangent = normalize(vec3(eps, wave_dx.y - wave.y, 0.0));
    vec3 bitangent = normalize(vec3(0.0, wave_dz.y - wave.y, eps));
    NORMAL = normalize(cross(bitangent, tangent));
}

void fragment() {
    // Fresnel effect for reflection
    float fresnel = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), fresnel_power);

    // Depth-based color (shallow near shore, deep far out)
    float depth_factor = clamp(wave_y / wave_height + 0.5, 0.0, 1.0);
    vec3 water_color = mix(deep_color.rgb, shallow_color.rgb, depth_factor);

    // Whitecap foam on wave peaks
    float whitecap = smoothstep(foam_threshold * wave_height, wave_height, wave_y);
    water_color = mix(water_color, foam_color.rgb, whitecap * 0.6);

    // Sky reflection
    vec3 sky_color = vec3(0.6, 0.7, 0.85);
    water_color = mix(water_color, sky_color, fresnel * reflectivity);

    ALBEDO = water_color;
    ALPHA = mix(deep_color.a, 0.95, fresnel);
    ROUGHNESS = 0.1;
    METALLIC = 0.0;
    SPECULAR = 0.8;
}
