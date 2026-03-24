shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, unshaded;

uniform vec4 cloud_color : source_color = vec4(1.0, 1.0, 1.0, 0.85);
uniform float softness : hint_range(0.0, 1.0) = 0.4;

void vertex() {
    // Billboard: always face camera
    MODELVIEW_MATRIX = VIEW_MATRIX * mat4(
        vec4(normalize(cross(vec3(0.0, 1.0, 0.0), MODELVIEW_MATRIX[2].xyz)), 0.0),
        vec4(0.0, 1.0, 0.0, 0.0),
        vec4(normalize(cross(MODELVIEW_MATRIX[0].xyz, vec3(0.0, 1.0, 0.0))), 0.0),
        MODEL_MATRIX[3]
    );
    MODELVIEW_MATRIX = VIEW_MATRIX * MODEL_MATRIX;
    // Use cylindrical billboard (keep upright)
    MODELVIEW_MATRIX[0] = vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0);
    MODELVIEW_MATRIX[2] = vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0);
}

void fragment() {
    // Soft circular shape from UV
    vec2 centered = UV * 2.0 - 1.0;
    float dist = length(centered);
    float alpha = smoothstep(1.0, 1.0 - softness, dist) * cloud_color.a;

    ALBEDO = cloud_color.rgb;
    ALPHA = alpha;
}
