shader_type canvas_item;

uniform float vignette_intensity : hint_range(0.0, 0.3) = 0.09;
uniform float grain_intensity : hint_range(0.0, 0.1) = 0.03;
uniform float desaturation : hint_range(0.0, 1.0) = 0.0;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
    vec4 color = texture(TEXTURE, UV);

    // Vignette
    vec2 centered = UV * 2.0 - 1.0;
    float dist = length(centered);
    float vignette = 1.0 - dist * dist * vignette_intensity * 4.0;
    color.rgb *= vignette;

    // Film grain
    float noise = rand(UV + vec2(TIME * 0.1, TIME * 0.07)) * 2.0 - 1.0;
    color.rgb += vec3(noise * grain_intensity);

    // Speed desaturation
    if (desaturation > 0.0) {
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(color.rgb, vec3(luma), desaturation);
    }

    COLOR = color;
}
