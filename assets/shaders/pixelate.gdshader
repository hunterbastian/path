shader_type canvas_item;

uniform float pixel_size : hint_range(1.0, 8.0) = 4.0;

void fragment() {
	vec2 screen_size = 1.0 / SCREEN_PIXEL_SIZE;
	vec2 grid = floor(SCREEN_UV * screen_size / pixel_size) * pixel_size / screen_size;
	COLOR = texture(TEXTURE, grid);
}
