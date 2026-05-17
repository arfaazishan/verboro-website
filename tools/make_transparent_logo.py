from PIL import Image


source = "assets/Verboro_blue_gold_logo.png"


def remove_light_background(image):
    image = image.convert("RGBA")
    pixels = []
    for red, green, blue, alpha in image.getdata():
        brightest = max(red, green, blue)
        darkest = min(red, green, blue)
        is_light_neutral = darkest > 185 and brightest - darkest < 42
        if is_light_neutral:
            alpha = 0
        elif darkest > 150 and brightest - darkest < 56:
            alpha = int(alpha * max(0, 185 - darkest) / 35)
        pixels.append((red, green, blue, alpha))
    image.putdata(pixels)
    return image


full_logo = remove_light_background(Image.open(source))
full_logo.save("assets/Verboro_logo_transparent.png")

wordmark = Image.open(source).crop((88, 660, 1168, 925))
wordmark = remove_light_background(wordmark)
wordmark.save("assets/Verboro_wordmark_transparent.png")
