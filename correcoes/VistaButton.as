package com.gamedozer.battalion.ui
{
   import com.gamedozer.battalion.utils.BitmapLibrary;
   import com.urbansquall.display.Tile9;
   import com.urbansquall.display.Tile9Data;
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.filters.DropShadowFilter;
   import flash.geom.ColorTransform;
   import flash.geom.Rectangle;
   import flash.text.TextFieldAutoSize;
   
   public class VistaButton extends SimpleButton
   {
      
      private static const TEXT_COLOR:uint = 0;
      
      public static const DESC_COLOR:uint = 6773846;
      
      private static const DEFAULT_WIDTH:int = 130;
      
      private static const DEFAULT_HEIGHT:int = 38;
      
      private static const TILE9_DATA:Tile9Data = new Tile9Data(new Bitmap(BitmapLibrary.loadBitmap("btn_tile9")),new Rectangle(6,8,12,8));
      
      private static const BTN_OVERLAY:BitmapData = BitmapLibrary.loadBitmap("btn_overlay");
      
      private var m_over:VistaButtonState;
      
      private var m_down:VistaButtonState;
      
      private var m_up:VistaButtonState;

      private var m_hit:Sprite;
      
      public function VistaButton(a_title:String, a_iconClass:Class = null, a_description:String = null)
      {
         m_up = new VistaButtonState();
         m_up.bg = new Tile9(TILE9_DATA);
         m_up.overlay = new Bitmap(BTN_OVERLAY);
         m_up.title = new HeadingTextField(a_title,TEXT_COLOR);
         m_up.image.filters = [new DropShadowFilter(2)];
         m_over = new VistaButtonState();
         m_over.bg = new Tile9(TILE9_DATA);
         m_over.overlay = new Bitmap(BTN_OVERLAY);
         m_over.title = new HeadingTextField(a_title,TEXT_COLOR);
         m_over.image.transform.colorTransform = new ColorTransform(1.1,1.1,1.1);
         m_over.image.filters = [new DropShadowFilter(2)];
         m_down = new VistaButtonState();
         m_down.bg = new Tile9(TILE9_DATA);
         m_down.overlay = new Bitmap(BTN_OVERLAY);
         m_down.title = new HeadingTextField(a_title,TEXT_COLOR);
         m_down.image.x = 1;
         m_down.image.y = 1;
         m_down.image.filters = [new DropShadowFilter(3,45,0,1,4,4,1,1,true)];
         if(a_iconClass != null)
         {
            try
            {
               m_up.icon = new a_iconClass();
               m_over.icon = new a_iconClass();
               m_down.icon = new a_iconClass();
            }
            catch(e:TypeError)
            {
               m_up.wrapIcon(a_iconClass);
               m_over.wrapIcon(a_iconClass);
               m_down.wrapIcon(a_iconClass);
            }
            catch(e:ArgumentError)
            {
               m_up.wrapIcon(a_iconClass,true);
               m_over.wrapIcon(a_iconClass,true);
               m_down.wrapIcon(a_iconClass,true);
            }
         }
         if(a_description != null)
         {
            m_up.description = new CustomTextField(a_description,DESC_COLOR,14);
            m_over.description = new CustomTextField(a_description,DESC_COLOR,14);
            m_down.description = new CustomTextField(a_description,DESC_COLOR,14);
         }
         super(m_up.image,m_over.image,m_down.image,m_up.image);
         m_hit = new Sprite();
         hitTestState = m_hit;
         this.width = DEFAULT_WIDTH;
         this.height = DEFAULT_HEIGHT;
         MouseButtonizer.buttonize(this);
      }
      
      override public function get width() : Number
      {
         return m_up.width;
      }
      
      override public function get height() : Number
      {
         return m_up.height;
      }
      
      override public function set width(a_width:Number) : void
      {
         m_up.width = a_width;
         m_over.width = a_width;
         m_down.width = a_width;
         fitTitles();
         updateHitArea();
      }
      
      override public function set height(a_height:Number) : void
      {
         m_up.height = a_height;
         m_over.height = a_height;
         m_down.height = a_height;
         fitTitles();
         updateHitArea();
      }
      
      private function updateHitArea() : void
      {
         if(m_hit == null)
         {
            return;
         }
         m_hit.graphics.clear();
         m_hit.graphics.beginFill(0);
         m_hit.graphics.drawRect(0,0,m_up.width,m_up.height);
         m_hit.graphics.endFill();
      }

      private function fitTitles() : void
      {
         var states:Array = [m_up,m_over,m_down];
         for each(var state:VistaButtonState in states)
         {
            var label:CustomTextField = state.title;
            var left:Number = state.icon == null ? 6 : state.icon.width + 12;
            var available:Number = Math.max(1,state.width - left - 6);
            label.scaleX = 1;
            label.autoSize = TextFieldAutoSize.LEFT;
            label.wordWrap = false;
            label.scaleX = Math.min(1,available / label.width);
            label.x = left + (available - label.width) / 2;
            if(state.description == null)
            {
               label.y = (state.height - label.height) / 2 - 2;
            }
         }
      }

      public function set titleSize(a_size:int) : void
      {
         m_up.title = new HeadingTextField(m_up.title.text,TEXT_COLOR,a_size);
         m_over.title = new HeadingTextField(m_up.title.text,TEXT_COLOR,a_size);
         m_down.title = new HeadingTextField(m_up.title.text,TEXT_COLOR,a_size);
         fitTitles();
      }
      
      public function get titleSize() : int
      {
         return m_up.title.size;
      }
   }
}


