import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Dimensions, Animated,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Ad } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';

const SCREEN_WIDTH = Dimensions.get('window').width;
const H_PADDING = 16;
const SLIDE_WIDTH = SCREEN_WIDTH - H_PADDING * 2;
const SLIDE_HEIGHT = 160;
const AUTO_SCROLL_MS = 5000;

// Placeholder banners shown when no approved ads exist
const PLACEHOLDER_BANNERS = [
  {
    id: 'p1',
    title: 'Скидки до 50%',
    subtitle: 'На электронику и гаджеты',
    gradient: ['#4251E8', '#5B67F5'],
  },
  {
    id: 'p2',
    title: 'Новые поступления',
    subtitle: 'Каждый день свежие товары',
    gradient: ['#0EBF7F', '#1A9E6C'],
  },
  {
    id: 'p3',
    title: 'Быстрая доставка',
    subtitle: 'По всему Узбекистану',
    gradient: ['#F5793A', '#E8502A'],
  },
];

interface Props {
  ads: Ad[];
}

export default function BannerCarousel({ ads }: Props) {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotAnim = useRef(new Animated.Value(0)).current;

  const items = ads.length > 0 ? ads : null;
  const placeholders = PLACEHOLDER_BANNERS;
  const count = items ? items.length : placeholders.length;

  const goTo = (idx: number, animated = true) => {
    currentRef.current = idx;
    setCurrent(idx);
    scrollRef.current?.scrollTo({ x: idx * SLIDE_WIDTH, animated });
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (count <= 1) return;
    timerRef.current = setInterval(() => {
      const next = (currentRef.current + 1) % count;
      goTo(next);
    }, AUTO_SCROLL_MS);
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [count]);

  const handleScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    currentRef.current = idx;
    setCurrent(idx);
    startTimer();
  };

  const renderAdSlide = (ad: Ad, i: number) => {
    const uri = getImageUrl(ad.imageUrl);
    return (
      <View key={String(ad.id)} style={styles.slide}>
        {uri ? (
          <>
            <Image source={{ uri }} style={styles.image} resizeMode="cover" />
            <View style={styles.imageOverlay} />
            <View style={styles.textLayer}>
              <Text style={styles.adTitle} numberOfLines={1}>{ad.title}</Text>
              {ad.content ? (
                <Text style={styles.adSubtitle} numberOfLines={2}>{ad.content}</Text>
              ) : null}
            </View>
          </>
        ) : (
          <View style={[styles.gradientFallback, { backgroundColor: colors.primary }]}>
            <View style={styles.textLayer}>
              <Text style={styles.adTitle} numberOfLines={1}>{ad.title}</Text>
              {ad.content ? (
                <Text style={styles.adSubtitle} numberOfLines={2}>{ad.content}</Text>
              ) : null}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderPlaceholder = (p: typeof placeholders[0]) => (
    <View key={p.id} style={[styles.slide, { backgroundColor: p.gradient[0] }]}>
      <View style={[styles.placeholderAccent, { backgroundColor: p.gradient[1] + '60' }]} />
      <View style={styles.textLayer}>
        <Text style={styles.adTitle}>{p.title}</Text>
        <Text style={styles.adSubtitle}>{p.subtitle}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={SLIDE_WIDTH}
        snapToAlignment="start"
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ gap: 0 }}
        style={{ width: SLIDE_WIDTH }}
      >
        {items
          ? items.map((ad, i) => renderAdSlide(ad, i))
          : placeholders.map(renderPlaceholder)}
      </ScrollView>

      {count > 1 && (
        <View style={styles.dots}>
          {Array.from({ length: count }).map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => { goTo(i); startTimer(); }}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <View
                style={[
                  styles.dot,
                  i === current
                    ? [styles.dotActive, { backgroundColor: '#FFFFFF' }]
                    : { backgroundColor: 'rgba(255,255,255,0.35)' },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: H_PADDING,
    marginBottom: 20,
    borderRadius: 18,
    overflow: 'hidden',
    height: SLIDE_HEIGHT,
  },
  slide: {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#4251E8',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  gradientFallback: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  placeholderAccent: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  textLayer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  adTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  adSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
  },
});
