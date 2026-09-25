import re

with open(r'd:\bilal-digital-solutions\samjho\build\build.js', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'const featuredIllustrations = \{[\s\S]*?\};\s*const featuredCards'
replacement = """const featuredIllustrations = {
    government: '<img src="/assets/featured-kisan.png" alt="PM Kisan Yojana" />',
    documents: '<img src="/assets/featured-pan.png" alt="PAN Card" />',
    business: '<img src="/assets/featured-udyam.png" alt="Udyam Registration" />',
  };

  const featuredCards"""

content = re.sub(pattern, replacement, content)

with open(r'd:\bilal-digital-solutions\samjho\build\build.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')