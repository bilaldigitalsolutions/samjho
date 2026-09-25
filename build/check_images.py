from PIL import Image
import numpy as np
import os

base_path = r'd:\bilal-digital-solutions\samjho\build\assets'
files = ['featured-kisan.png', 'featured-pan.png', 'featured-udyam.png']

for f in files:
    filepath = os.path.join(base_path, f)
    img = Image.open(filepath).convert('RGBA')
    width, height = img.size
    pixels = np.array(img)
    
    # Find non-transparent pixels (alpha > 10)
    alpha = pixels[:, :, 3]
    non_transparent = np.where(alpha > 10)
    
    if len(non_transparent[0]) > 0:
        top = non_transparent[0].min()
        bottom = non_transparent[0].max()
        left = non_transparent[1].min()
        right = non_transparent[1].max()
        
        content_width = right - left + 1
        content_height = bottom - top + 1
        
        padding_top = top
        padding_bottom = height - bottom - 1
        padding_left = left
        padding_right = width - right - 1
        
        print(f'{f}:')
        print(f'  File size: {width}x{height}px')
        print(f'  Content bounds: {content_width}x{content_height}px')
        print(f'  Padding: top={padding_top}, bottom={padding_bottom}, left={padding_left}, right={padding_right}')
        print(f'  Content ratio: {content_width/width:.2%} x {content_height/height:.2%}')
        print()
    else:
        print(f'{f}: No non-transparent pixels found')
        print()