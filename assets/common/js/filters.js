const fsSource_noFilter = `
precision mediump float;

uniform sampler2D u_image;
varying vec2 v_texCoord;

void main() {
  gl_FragColor = texture2D(u_image, v_texCoord);
}
`;

const fsSource_grayScale = `
precision mediump float;

uniform sampler2D u_image;
varying vec2 v_texCoord;

vec4 generic_desaturate(vec3 color, float factor) {
vec3 lum = vec3(0.299, 0.587, 0.114);
vec3 gray = vec3(dot(lum, color));
return vec4(mix(color, gray, factor), 1.0);
}

void main() {
gl_FragColor = texture2D(u_image, v_texCoord);
vec2 uv = vec2(1.0, 1.0);
vec3 color = vec3(texture2D(u_image, v_texCoord).r, texture2D(u_image, v_texCoord).g, texture2D(u_image, v_texCoord).b);
gl_FragColor = generic_desaturate(color, 1.0);
}
`;

const fsSource_oldTV = `
precision mediump float;

uniform sampler2D u_image;
varying vec2 v_texCoord;

void main() {

float WarpAmount = 2.0;
float iTime = 30.0;
WarpAmount *= sin(iTime*3.0)*0.5 + 0.5;


// Normalized pixel coordinates (from 0 to 1)
vec2 uv = v_texCoord.xy;

//Center UVs
vec2 CenteredUVs = uv - 0.5;

//Circle Mask (for Warped UVs);
float Circle = dot(CenteredUVs,CenteredUVs);
Circle *= Circle;
Circle *= WarpAmount;

//Final Warped UVs
CenteredUVs = Circle * (uv - 0.5);
CenteredUVs = CenteredUVs + uv;

//Mask to Hide repeating texture
vec2 UVMask;
UVMask.x = min(CenteredUVs.x,CenteredUVs.y);
UVMask.y = 1.0-max(CenteredUVs.x,CenteredUVs.y);
float Mask = ceil(min(UVMask.x,UVMask.y));

//Sample Texture and hide repeating areas
vec4 texColor = texture2D(u_image,CenteredUVs);
texColor = mix(vec4(0.0),texColor,Mask);


// Output to screen
gl_FragColor = texColor;
}
`;

  const fsSource_warpOfWest = `
  precision mediump float;

  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  vec3 noise(vec2 uv) {
    return texture2D(u_image, uv).xyz;
  }

// from https://thebookofshaders.com/13
#define NUM_OCTAVES 5
float fbm (vec2 uv) {
float v = 0.0;
float a = 0.5;
vec2 shift = vec2(100.0);
// Rotate to reduce axial bias
mat2 rot = mat2(cos(0.5), sin(0.5),
                -sin(0.5), cos(0.50));
for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * noise(uv).x;
    uv = rot * uv * 2.0 + shift;
    a *= 0.5;
}
return v;
}

  void main() {
    vec2 uv = v_texCoord.xy;
vec2 p = uv*0.01;

// Time varying pixel color
vec3 col = vec3(0);
float iTime = 30.0;

float f = fbm(p+fbm(p)*iTime*0.01);

vec3 img = texture2D(u_image, uv*f).xyz;

//col = img;
//col = vec3(f,f,1);
col = mix(vec3(0.3,0.6,0.8)*f, img, 2.*(sin(iTime)+0.5));

// Output to screen
gl_FragColor = vec4(col,1.0);
  }
  `;

  const fsSource_warp1 = `
  precision mediump float;

  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  void main() {
    float iTime = 30.0;
    vec2 uv = v_texCoord.xy;

// Center the coordinates around (0.5, 0.5)
uv = uv * 2.0 - 1.0;

// Convert to polar coordinates
float r = length(uv);
float theta = atan(uv.y, uv.x);

// Apply a distortion effect with time evolution
float timeFactor = iTime * 2.0; // Adjust the speed of evolution here
theta += 0.1 * sin(timeFactor + r * 10.0);

// Introduce an evolving warp pattern
float wave = 0.2 * sin(iTime + r * 0.5);

uv = vec2(cos(theta + wave), sin(theta + wave)) * r;

// Adjust the coordinates back to the range (0, 1)
uv = (uv + 1.0) / 2.0;

// Sample the texture from u_image
vec4 texColor = texture2D(u_image, uv);

// Output the color
gl_FragColor = vec4(texColor.rgb, 1.0);
  }
  `;

export { fsSource_noFilter, fsSource_grayScale, fsSource_oldTV, fsSource_warpOfWest, fsSource_warp1 }
