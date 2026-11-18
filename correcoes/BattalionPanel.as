package com.gamedozer.battalion.ui
{
   import com.gamedozer.battalion.utils.BitmapLibrary;
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.DisplayObject;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   
   public class BattalionPanel extends MovieClip
   {
      
      protected var m_title:CustomTextField;
      
      protected static var bitmapData:BitmapData;
      
      public static const SPOTTED:String = "spotted_texture";
      
      public static const WOOD:String = "wood_texture";
      
      public static const FRAME1:String = "frame1";
      
      public static const FRAME2:String = "frame2";
      
      public var rWidth:int;
      
      public var rHeight:int;
      
      public function BattalionPanel(a_width:int = -1, a_height:int = -1, a_bitmap:String = "wood_texture", a_frame:String = "frame1", a_title:String = "")
      {
         var child0:DisplayObject = null;
         var bgBorder:Sprite = null;
         var size:int = 0;
         var frame1:Bitmap = null;
         var frame2:Bitmap = null;
         super();
         if(bitmapData == null)
         {
            bitmapData = BitmapLibrary.loadBitmap(a_bitmap);
         }
         if(a_width == -1)
         {
            rWidth = Math.ceil(width);
            rHeight = Math.ceil(height);
            child0 = getChildAt(0);
            child0.visible = false;
            child0.scaleX = 0;
            child0.scaleY = 0;
            child0.width = 1;
            child0.height = 1;
            scaleX = 1;
            scaleY = 1;
         }
         else
         {
            rWidth = a_width;
            rHeight = a_height;
         }
         var child:Sprite = FrameMaker.createBlock(BitmapLibrary.loadBitmap(a_bitmap),rWidth,rHeight);
         addChild(child);
         if(a_title != "")
         {
            m_title = new HeadingTextField(a_title,16777215,16);
            fitTitle();
            m_title.y = 0;
            bgBorder = new Sprite();
            bgBorder.graphics.lineStyle(1,0,0);
            bgBorder.graphics.beginFill(0,0.5);
            bgBorder.graphics.drawRect(0,0,rWidth,m_title.height + 5);
            addChild(bgBorder);
            addChild(m_title);
         }
         if(a_frame == FRAME1)
         {
            size = 16;
            frame1 = new Bitmap(FrameMaker.createFrame(BitmapLibrary.loadBitmap(FRAME1),rWidth + size,rHeight + size,size,size));
            frame1.x = frame1.y = -size / 2;
            addChild(frame1);
         }
         else if(a_frame == FRAME2)
         {
            size = 32;
            frame2 = new Bitmap(FrameMaker.createFrame(BitmapLibrary.loadBitmap(FRAME2),rWidth + size + 3,rHeight + size + 6,size,size));
            frame2.x = -size / 2;
            frame2.y = -size / 2 - 3;
            addChild(frame2);
         }
      }
      
      public function set title(a_title:String) : void
      {
         if(m_title == null)
         {
            return;
         }
         m_title.text = a_title;
         fitTitle();
      }

      private function fitTitle() : void
      {
         m_title.scaleX = 1;
         m_title.scaleX = Math.min(1,Math.max(1,rWidth - 8) / m_title.width);
         m_title.x = (rWidth - m_title.width) / 2;
      }
      
      override public function get width() : Number
      {
         return rWidth;
      }
      
      override public function get height() : Number
      {
         return rHeight;
      }
   }
}


