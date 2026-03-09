import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;

public class GenerateAndroidIcons {
    private record Density(String name, int launcherSize, int adaptiveSize) {}

    private static final Density[] DENSITIES = new Density[] {
            new Density("mdpi", 48, 108),
            new Density("hdpi", 72, 162),
            new Density("xhdpi", 96, 216),
            new Density("xxhdpi", 144, 324),
            new Density("xxxhdpi", 192, 432)
    };

    public static void main(String[] args) throws IOException {
        String root = args.length > 0 ? args[0] : ".";
        File source = new File(root, "icon.png");
        if (!source.exists()) {
            throw new IOException("Missing icon source: " + source.getAbsolutePath());
        }

        BufferedImage src = ImageIO.read(source);
        if (src == null) {
            throw new IOException("Failed to read source icon: " + source.getAbsolutePath());
        }

        File resRoot = new File(root, "android/app/src/main/res");
        for (Density density : DENSITIES) {
            File mipmap = new File(resRoot, "mipmap-" + density.name);

            // Legacy launcher icons: keep larger visible area.
            writeIcon(src, density.launcherSize, 0.82, new File(mipmap, "ic_launcher.png"));
            writeIcon(src, density.launcherSize, 0.82, new File(mipmap, "ic_launcher_round.png"));

            // Adaptive foreground: keep within safe zone to avoid OEM mask clipping.
            writeIcon(src, density.adaptiveSize, 0.60, new File(mipmap, "ic_launcher_foreground.png"));
        }

        System.out.println("Android launcher icons generated from icon.png");
    }

    private static void writeIcon(BufferedImage src, int canvasSize, double drawRatio, File out) throws IOException {
        BufferedImage canvas = new BufferedImage(canvasSize, canvasSize, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = canvas.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            int drawSize = (int) Math.round(canvasSize * drawRatio);
            int x = (canvasSize - drawSize) / 2;
            int y = (canvasSize - drawSize) / 2;
            g.drawImage(src, x, y, drawSize, drawSize, null);
        } finally {
            g.dispose();
        }

        File parent = out.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Failed to create output directory: " + parent.getAbsolutePath());
        }
        ImageIO.write(canvas, "png", out);
    }
}
