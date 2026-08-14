/**
 * pet-avatar —— 宠物头像（设计文档 §7.4 头像位）
 *
 * 属性：
 *   src      String  ''        图片地址（云存储 fileID cloud:// 可直接渲染）
 *   species  String  'other'   无头像时的物种线性剪影：
 *                              cat/dog/rabbit/hamster/bird/reptile/other
 *   size     String  '104rpx'  尺寸
 *   shape    String  'square'  square=圆角矩形 radius-s（卡片用）/ circle=圆形 radius-full
 *
 * 事件：无
 *
 * 示例：
 *   <pet-avatar src="{{pet.avatar}}" species="{{pet.species}}" size="104rpx" />
 *   <pet-avatar src="{{pet.avatar}}" species="cat" shape="circle" size="96rpx" />
 */
var icons = require('../icons.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    src: { type: String, value: '' },
    species: {
      type: String,
      value: 'other',
      observer: function (species) {
        this.setData({ speciesUri: icons.maskIcon(species) });
      }
    },
    size: { type: String, value: '104rpx' },
    shape: { type: String, value: 'square' }
  },

  data: {
    speciesUri: icons.maskIcon('other')
  }
});
