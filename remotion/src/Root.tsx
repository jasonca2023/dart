import { Composition } from "remotion";
import { ProductAd, productAdSchema } from "./ProductAd";

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ProductAd"
      component={ProductAd}
      schema={productAdSchema}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={FPS * 10}
      defaultProps={{
        productTitle: "2026 Model HDMI DVD Player for TV",
        productImage:
          "https://m.media-amazon.com/images/I/71Gqkj-OujL._AC_SL1500_.jpg",
        price: "$39.99",
        audience: "home movie lovers",
        durationInSeconds: 10,
        aspectRatio: "16:9" as const,
        accent: "#0447ff",
      }}
      calculateMetadata={({ props }) => {
        const dims =
          props.aspectRatio === "9:16"
            ? { width: 1080, height: 1920 }
            : { width: 1920, height: 1080 };
        return {
          ...dims,
          fps: FPS,
          durationInFrames: Math.max(1, Math.round(props.durationInSeconds * FPS)),
        };
      }}
    />
  );
};
