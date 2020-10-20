#define vram vs.__vram

#define COLOR_32BIT(a, b, c, r) \
    (((a) & 0xff) << 24) | (((b) & 0xff) << 16) | (((c) & 0xff) << 8) | ((r) & 0xff)

pseudo.CstrTexCache = (function() {
    const TEX_04BIT  = 0;
    const TEX_08BIT  = 1;
    const TEX_15BIT  = 2;

    // Maximum texture cache
    const TCACHE_MAX = 384;
    const TEX_SIZE   = 256;

    var cache = [];
    var index;
    var tex;

    return {
        init() {
            for (var i = 0; i < TCACHE_MAX; i++) {
                cache[i] = {
                    pos: { // Mem position of texture and color lookup table
                    },

                    tex: undefined
                };
            }

            tex = { // Texture and color lookup table buffer
                bfr: union(TEX_SIZE * TEX_SIZE * 4),
                cc : new UintWcap(256),
            };
        },

        reset(ctx) {
            for (const tc of cache) {
                if (tc.tex) {
                    ctx.deleteTexture(tc.tex);
                }
            }

            index = 0;
        },

        pixel2texel(p) {
            return COLOR_32BIT(p ? 255 : 0, (p >>> 10) << 3, (p >>> 5) << 3, p << 3);
        },

        fetchTexture(ctx, tp, clut) {
            const uid = (clut << 16) | tp;

            for (const tc of cache) {
                if (tc.uid === uid) { // Found cached texture
                    ctx.bindTexture(ctx.TEXTURE_2D, tc.tex);
                    return;
                }
            }

            // Basic info
            const tc  = cache[index];
            tc.pos.w  = (tp & 15) * 64;
            tc.pos.h  = ((tp >>> 4) & 1) * 256;
            tc.pos.cc = (clut & 0x7fff) * 16;

            // Reset
            tex.bfr.ub.fill(0);
            tex.cc.fill(0);

            switch((tp >>> 7) & 3) {
                case TEX_04BIT: // 16 color palette
                    for (var i = 0; i < 16; i++) {
                        tex.cc[i] = tcache.pixel2texel(vram.uh[tc.pos.cc]);
                        tc.pos.cc++;
                    }

                    for (var h = 0, idx = 0; h < 256; h++) {
                        for (var w = 0; w < (256 / 4); w++) {
                            const p = vram.uh[(tc.pos.h + h) * FRAME_W + tc.pos.w + w];
                            tex.bfr.uw[idx++] = tex.cc[(p >>>  0) & 15];
                            tex.bfr.uw[idx++] = tex.cc[(p >>>  4) & 15];
                            tex.bfr.uw[idx++] = tex.cc[(p >>>  8) & 15];
                            tex.bfr.uw[idx++] = tex.cc[(p >>> 12) & 15];
                        }
                    }
                    break;

                case TEX_08BIT: // 256 color palette
                    for (var i = 0; i < 256; i++) {
                        tex.cc[i] = tcache.pixel2texel(vram.uh[tc.pos.cc]);
                        tc.pos.cc++;
                    }

                    for (var h = 0, idx = 0; h < 256; h++) {
                        for (var w = 0; w < (256 / 2); w++) {
                            const p = vram.uh[(tc.pos.h + h) * FRAME_W + tc.pos.w + w];
                            tex.bfr.uw[idx++] = tex.cc[(p >>> 0) & 255];
                            tex.bfr.uw[idx++] = tex.cc[(p >>> 8) & 255];
                        }
                    }
                    break;

                case TEX_15BIT: // No color palette
                    for (var h = 0, idx = 0; h < 256; h++) {
                        for (var w = 0; w < 256; w++) {
                            const p = vram.uh[(tc.pos.h + h) * FRAME_W + tc.pos.w + w];
                            tex.bfr.uw[idx++] = tcache.pixel2texel(p);
                        }
                    }
                    break;

                default:
                    psx.error('Texture Cache Unknown ' + ((tp >>> 7) & 3));
                    break;
            }

            // Attach texture
            tc.tex = ctx.createTexture();
            ctx.bindTexture  (ctx.TEXTURE_2D, tc.tex);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
            ctx.texPhoto2D   (ctx.TEXTURE_2D, 0, ctx.RGBA, TEX_SIZE, TEX_SIZE, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, tex.bfr.ub);

            // Advance cache counter
            tc.uid = uid;
            index  = (index + 1) & (TCACHE_MAX - 1);
        },

        invalidate(iX, iY, iW, iH) {
            for (const tc of cache) {
                if (((tc.pos.w + 255) >= iX) && ((tc.pos.h + 255) >= iY) && ((tc.pos.w) <= iW) && ((tc.pos.h) <= iH)) {
                    tc.uid = 0;
                    continue;
                }
            }
        }
    };
})();

#undef vram
