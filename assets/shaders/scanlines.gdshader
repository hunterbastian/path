shader_type canvas_item;

uniform float line_count : hint_range(100.0, 800.0) = 300.0;
uniform float line_opacity : hint_range(0.0, 0.3) = 0.08;
uniform float flicker_speed : hint_range(0.0, 5.0) = 1.5;
uniform float flicker_intensity : hint_range(0.0, 0.05) = 0.02;

void fragment() {
	// Scanlines
	float scanline = sin(UV.y * line_count * 3.14159) * 0.5 + 0.5;
	float darkness = 1.0 - scanline * line_opacity;

	// Subtle flicker
	float flicker = 1.0 - flicker_intensity * sin(TIME * flicker_speed);

	COLOR = vec4(0.0, 0.0, 0.0, (1.0 - darkness) * flicker);
}
