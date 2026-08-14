/**
 * cell-group —— iOS inset-grouped 分组列表容器（设计文档 §7.4/§7.6）
 *
 * 属性：无（内容走默认 slot，放若干 <cell>）
 *
 * 事件：无
 *
 * 示例：
 *   <cell-group>
 *     <cell icon="bell" title="提醒" value="3 条" showArrow />
 *   </cell-group>
 *
 * 说明：白卡 radius-m 容器；通过 relations 通知组内 cell 自己的位次，
 * 由 cell 渲染 0.5px hairline 左缩进分隔（首行不渲染）。
 */
Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  relations: {
    '../cell/index': {
      type: 'child',
      linked: function () { this._updateCells(); },
      unlinked: function () { this._updateCells(); }
    }
  },

  methods: {
    _updateCells: function () {
      var cells = this.getRelationNodes('../cell/index') || [];
      cells.forEach(function (c, i) {
        c.setData({ _first: i === 0 });
      });
    }
  }
});
