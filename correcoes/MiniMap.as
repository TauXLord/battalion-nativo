package com.gamedozer.battalion.ui
{
   import com.gamedozer.battalion.BattalionMain;
   import com.gamedozer.battalion.data.TileManager;
   import com.gamedozer.battalion.game.GameManager;
   import com.gamedozer.battalion.utils.MouseHandler;
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.Sprite;
   import flash.events.MouseEvent;
   import flash.text.TextField;
   
   public class MiniMap extends Sprite
   {
      
      public static const MIN_WIDTH_FOOTPRINT:int = 132;
      
      private static var WIDTH:int = 136;
      
      public static const HEIGHT:int = 184;
      
      protected var ratio:Number;
      
      protected var dragging:Boolean;
      
      internal var string:TextField;
      
      protected var drag:Sprite;
      
      private var m_mapContainer:Sprite;

      private var viewportZoom:Number = 0;
      
      protected var invRatio:Number;
      
      internal var map:Sprite;
      
      public function MiniMap(a_map:BitmapData)
      {
         super();
         graphics.beginFill(0);
         graphics.drawRect(0,0,WIDTH,HEIGHT);
         m_mapContainer = new Sprite();
         var minimapMask:Sprite = new Sprite();
         minimapMask.graphics.beginFill(16711680);
         minimapMask.graphics.drawRect(0,0,WIDTH,HEIGHT);
         addChild(minimapMask);
         m_mapContainer.mask = minimapMask;
         map = new Sprite();
         map.addChild(new Bitmap(a_map));
         map.x = (WIDTH - map.width) / 2;
         map.y = (HEIGHT - map.height) / 2 - 4;
         m_mapContainer.addChild(map);
         addChild(m_mapContainer);
         x = BattalionMain.WIDTH - WIDTH;
         ratio = TileManager.getInstance().getMiniMapWidth() / BattalionMain.TILE_WIDTH;
         invRatio = BattalionMain.TILE_WIDTH / TileManager.getInstance().getMiniMapWidth();
         drag = new Sprite();
         setViewportZoom(1);
         drag.x = map.x;
         drag.y = map.y;
         m_mapContainer.addChild(drag);
         drag.addEventListener(MouseEvent.MOUSE_DOWN,mouseDownHandler);
         map.addEventListener(MouseEvent.CLICK,clickHandler);
         MouseHandler.getInstance().getStage().addEventListener(MouseEvent.MOUSE_MOVE,mouseMoveHandler);
         dragging = false;
      }
      
      private function mouseMoveHandler(e:MouseEvent) : void
      {
         if(dragging)
         {
            if(MouseHandler.getInstance().isDown())
            {
               doScroll(true);
            }
            else
            {
               dragging = false;
            }
         }
      }
      
      public function getMap() : Sprite
      {
         return map;
      }
      
      private function clickHandler(e:MouseEvent) : void
      {
         if(GameManager.getInstance().getCamera().isEnabled())
         {
            doScroll(false);
         }
      }
      
      private function mouseDownHandler(e:MouseEvent) : void
      {
         if(GameManager.getInstance().getCamera().isEnabled())
         {
            dragging = true;
         }
      }
      
      public function setViewportZoom(a_zoom:Number) : void
      {
         if(viewportZoom == a_zoom)
         {
            return;
         }
         viewportZoom = a_zoom;
         drag.graphics.clear();
         drag.graphics.lineStyle(1,16776960,1);
         drag.graphics.beginFill(0,0);
         drag.graphics.drawRect(0,0,Math.min(map.width,GameManager.GAME_WIDTH * ratio / a_zoom),Math.min(map.height,GameManager.GAME_HEIGHT * ratio / a_zoom));
         drag.graphics.endFill();
      }

      public function setDrag(x:int, y:int) : void
      {
         if(!dragging)
         {
            drag.x = map.x + x * ratio;
            drag.y = map.y + y * ratio;
            m_mapContainer.x = -drag.x + 32 * (6 / TileManager.getInstance().getMiniMapWidth()) + 2;
            m_mapContainer.y = -drag.y + 40 * (6 / TileManager.getInstance().getMiniMapHeight());
         }
      }
      
      private function doScroll(forceDrag:Boolean) : void
      {
         forceDrag = false;
         var ox:Number = drag.x;
         var oy:Number = drag.y;
         drag.x = MouseHandler.getInstance().getX() - x - m_mapContainer.x - drag.width / 2;
         drag.y = MouseHandler.getInstance().getY() - y - m_mapContainer.y - drag.height / 2;
         if(drag.x < map.x)
         {
            drag.x = map.x;
         }
         if(drag.y < map.y)
         {
            drag.y = map.y;
         }
         if(drag.x + drag.width > map.x + map.width + 2)
         {
            drag.x = map.x + map.width - drag.width + 2;
         }
         if(drag.y + drag.height > map.y + map.height + 2)
         {
            drag.y = map.y + map.height - drag.height + 2;
         }
         var mx:int = (map.x - drag.x) * invRatio;
         var my:int = (map.y - drag.y) * invRatio;
         GameManager.getInstance().getCamera().setLocation(mx,my);
         if(forceDrag)
         {
         }
         setDrag(mx,my);
      }
   }
}

